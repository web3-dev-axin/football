// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "../src/MockUSDC.sol";
import {ConditionalTokensLite} from "../src/ConditionalTokensLite.sol";
import {WorldCupMarket} from "../src/WorldCupMarket.sol";
import {WorldCupMarketFactory} from "../src/WorldCupMarketFactory.sol";
import {OptimisticResultOracle} from "../src/OptimisticResultOracle.sol";

interface VmAccounting {
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract WorldCupMarketAccountingTest {
    VmAccounting internal constant vm = VmAccounting(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC internal usdc;
    ConditionalTokensLite internal ctf;
    OptimisticResultOracle internal oracle;
    WorldCupMarketFactory internal factory;
    WorldCupMarket internal market;
    bytes32 internal marketId;
    bytes32 internal conditionId;
    address internal trader = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        ctf = new ConditionalTokensLite();
        oracle = new OptimisticResultOracle(0);
        factory = new WorldCupMarketFactory(usdc, ctf, address(oracle));
        ctf.transferOwnership(address(factory));
        (address marketAddress, bytes32 createdMarketId, bytes32 createdConditionId) = factory.createMarket(
            "fixture:demo-2026-001:goal_window:3780:4380:accounting",
            "demo-2026-001",
            3780,
            4380,
            block.timestamp + 600,
            keccak256("goal-in-window"),
            2
        );
        market = WorldCupMarket(marketAddress);
        marketId = createdMarketId;
        conditionId = createdConditionId;
        usdc.mint(trader, 500_000_000);
        vm.prank(trader);
        usdc.approve(address(market), type(uint256).max);
    }

    function testBuyThenSellReturnsCollateralAndBurnsShares() public {
        vm.prank(trader);
        market.buy(0, 120_000_000, 1);
        uint256 tokenId = ctf.getPositionId(conditionId, 0);
        require(ctf.balanceOf(tokenId, trader) == 120_000_000, "shares missing");
        uint256 balanceBeforeSell = usdc.balanceOf(trader);
        vm.prank(trader);
        uint256 returned = market.sell(0, 20_000_000, 20_000_000);
        require(returned == 20_000_000, "collateral returned wrong");
        require(usdc.balanceOf(trader) == balanceBeforeSell + 20_000_000, "sell balance wrong");
        require(ctf.balanceOf(tokenId, trader) == 100_000_000, "shares not burned");
    }

    function testRedeemBurnsWinningSharesAndRejectsSecondRedeem() public {
        vm.prank(trader);
        market.buy(0, 100_000_000, 1);
        oracle.proposeResult(address(market), payload(0));
        oracle.finalize(marketId);
        vm.prank(trader);
        uint256 paid = market.redeem(0, 100_000_000);
        require(paid == 100_000_000, "winning payout wrong");
        vm.prank(trader);
        vm.expectRevert(ConditionalTokensLite.InsufficientShares.selector);
        market.redeem(0, 1);
    }

    function testVoidRefundBurnsSharesAndRejectsSecondRefund() public {
        vm.prank(trader);
        market.buy(1, 75_000_000, 1);
        oracle.voidMarket(address(market), marketId);
        vm.prank(trader);
        uint256 paid = market.refund(1, 75_000_000);
        require(paid == 75_000_000, "refund payout wrong");
        vm.prank(trader);
        vm.expectRevert(ConditionalTokensLite.InsufficientShares.selector);
        market.refund(1, 1);
    }

    function payload(uint8 winningOutcome) internal view returns (OptimisticResultOracle.ResultPayload memory) {
        return OptimisticResultOracle.ResultPayload({
            marketId: marketId,
            winningOutcome: winningOutcome,
            homeScore: 1,
            awayScore: 0,
            dataSourceHash: keccak256("accounting-events"),
            evidenceUri: "demo://accounting"
        });
    }
}
