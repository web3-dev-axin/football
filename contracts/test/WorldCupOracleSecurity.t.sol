// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "../src/MockUSDC.sol";
import {ConditionalTokensLite} from "../src/ConditionalTokensLite.sol";
import {WorldCupMarket} from "../src/WorldCupMarket.sol";
import {WorldCupMarketFactory} from "../src/WorldCupMarketFactory.sol";
import {OptimisticResultOracle} from "../src/OptimisticResultOracle.sol";

interface VmSecurity {
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
}

contract WorldCupOracleSecurityTest {
    VmSecurity internal constant vm = VmSecurity(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC internal usdc;
    ConditionalTokensLite internal ctf;
    OptimisticResultOracle internal oracle;
    WorldCupMarketFactory internal factory;
    WorldCupMarket internal market;
    bytes32 internal marketId;
    address internal attacker = address(0xBAD);

    function setUp() public {
        usdc = new MockUSDC();
        ctf = new ConditionalTokensLite();
        oracle = new OptimisticResultOracle(600);
        factory = new WorldCupMarketFactory(usdc, ctf, address(oracle));
        ctf.transferOwnership(address(factory));
        (address marketAddress, bytes32 createdMarketId,) = factory.createMarket(
            "fixture:demo-2026-001:goal_window:3780:4380:security",
            "demo-2026-001",
            3780,
            4380,
            block.timestamp + 600,
            keccak256("goal-in-window"),
            2
        );
        market = WorldCupMarket(marketAddress);
        marketId = createdMarketId;
    }

    function testNonOwnerCannotAdminResolveOrVoid() public {
        oracle.proposeResult(address(market), payload(0));
        vm.prank(attacker);
        vm.expectRevert(OptimisticResultOracle.NotOwner.selector);
        oracle.adminResolve(marketId, 0);
        vm.prank(attacker);
        vm.expectRevert(OptimisticResultOracle.NotOwner.selector);
        oracle.voidMarket(address(market), marketId);
    }

    function testFinalizeIsBlockedByChallengeUntilAdminResolve() public {
        oracle.proposeResult(address(market), payload(0));
        oracle.challenge(marketId, "provider mismatch", "demo://security/challenge");
        vm.warp(block.timestamp + 700);
        vm.expectRevert(OptimisticResultOracle.ProposalChallenged.selector);
        oracle.finalize(marketId);
        oracle.adminResolve(marketId, 1);
        require(market.status() == WorldCupMarket.Status.Redeemable, "admin resolve failed");
        require(market.winningOutcome() == 1, "admin outcome wrong");
    }

    function testCannotChallengeOrResolveAfterFinalize() public {
        oracle.proposeResult(address(market), payload(0));
        vm.warp(block.timestamp + 700);
        oracle.finalize(marketId);
        vm.expectRevert(OptimisticResultOracle.AlreadyFinalized.selector);
        oracle.challenge(marketId, "late", "demo://late");
        vm.expectRevert(OptimisticResultOracle.AlreadyFinalized.selector);
        oracle.adminResolve(marketId, 1);
    }

    function testCannotChallengeAfterChallengeDeadline() public {
        oracle.proposeResult(address(market), payload(0));
        vm.warp(block.timestamp + 700);
        vm.expectRevert(OptimisticResultOracle.ChallengeWindowClosed.selector);
        oracle.challenge(marketId, "late", "demo://late");
    }

    function payload(uint8 winningOutcome) internal view returns (OptimisticResultOracle.ResultPayload memory) {
        return OptimisticResultOracle.ResultPayload({
            marketId: marketId,
            winningOutcome: winningOutcome,
            homeScore: 1,
            awayScore: 0,
            dataSourceHash: keccak256("security-events"),
            evidenceUri: "demo://security"
        });
    }
}
