// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "../src/MockUSDC.sol";
import {ConditionalTokensLite} from "../src/ConditionalTokensLite.sol";
import {WorldCupMarket} from "../src/WorldCupMarket.sol";
import {WorldCupMarketFactory} from "../src/WorldCupMarketFactory.sol";
import {OptimisticResultOracle} from "../src/OptimisticResultOracle.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
}

contract CtfMarketHarness {
    ConditionalTokensLite public ctf;

    constructor(ConditionalTokensLite ctf_) {
        ctf = ctf_;
    }

    function mint(address user, bytes32 conditionId, uint256 outcomeIndex, uint256 amount) external {
        ctf.mintPosition(user, conditionId, outcomeIndex, amount);
    }

    function burn(address user, bytes32 conditionId, uint256 outcomeIndex, uint256 amount) external {
        ctf.burnPosition(user, conditionId, outcomeIndex, amount);
    }

    function report(bytes32 conditionId, uint256[] calldata payouts) external {
        ctf.reportPayouts(conditionId, payouts);
    }
}

contract WorldCupLiveMarketTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC internal usdc;
    ConditionalTokensLite internal ctf;
    OptimisticResultOracle internal oracle;
    WorldCupMarketFactory internal factory;
    WorldCupMarket internal market;
    bytes32 internal marketId;
    bytes32 internal conditionId;

    address internal userA = address(0xA11CE);
    address internal userB = address(0xB0B);
    uint256 internal closeTime;

    function setUp() public {
        usdc = new MockUSDC();
        ctf = new ConditionalTokensLite();
        oracle = new OptimisticResultOracle(600);
        factory = new WorldCupMarketFactory(usdc, ctf, address(oracle));
        ctf.transferOwnership(address(factory));
        closeTime = block.timestamp + 600;
        (address marketAddress, bytes32 createdMarketId, bytes32 createdConditionId) = factory.createMarket(
            "fixture:demo-2026-001:goal_window:3780:4380",
            "demo-2026-001",
            3780,
            4380,
            closeTime,
            keccak256("goal-in-window"),
            2
        );
        market = WorldCupMarket(marketAddress);
        marketId = createdMarketId;
        conditionId = createdConditionId;
        usdc.mint(userA, 1_000_000_000);
        usdc.mint(userB, 1_000_000_000);
        vm.prank(userA);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(userB);
        usdc.approve(address(market), type(uint256).max);
    }

    function testMockUsdcMintApproveTransferFrom() public {
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(userA), 1_000_000_000);
        vm.prank(userA);
        usdc.transfer(userB, 100_000_000);
        assertEq(usdc.balanceOf(userB), 1_100_000_000);
    }

    function testFactoryCreatesTwoOutcomeMarketAndRejectsDuplicateWindowKey() public {
        (, uint256 outcomeCount, bool prepared,,) = ctf.getCondition(conditionId);
        assertTrue(prepared);
        assertEq(outcomeCount, 2);
        vm.expectRevert(WorldCupMarketFactory.DuplicateMarket.selector);
        factory.createMarket(
            "fixture:demo-2026-001:goal_window:3780:4380",
            "demo-2026-001",
            3780,
            4380,
            closeTime,
            keccak256("goal-in-window"),
            2
        );
    }

    function testFactoryCreatesMatchWinnerAndExactScoreOutcomeCounts() public {
        (address winnerAddress,, bytes32 winnerCondition) = factory.createMarket(
            "fixture:demo-2026-001:match_winner",
            "demo-2026-001",
            0,
            5400,
            closeTime,
            keccak256("match-winner"),
            3
        );
        (, uint256 winnerOutcomeCount, bool winnerPrepared,,) = ctf.getCondition(winnerCondition);
        assertTrue(winnerPrepared);
        assertEq(winnerOutcomeCount, 3);
        assertEq(WorldCupMarket(winnerAddress).outcomeCount(), 3);

        (address scoreAddress,, bytes32 scoreCondition) = factory.createMarket(
            "fixture:demo-2026-001:exact_score",
            "demo-2026-001",
            0,
            5400,
            closeTime,
            keccak256("exact-score"),
            10
        );
        (, uint256 scoreOutcomeCount, bool scorePrepared,,) = ctf.getCondition(scoreCondition);
        assertTrue(scorePrepared);
        assertEq(scoreOutcomeCount, 10);
        assertEq(WorldCupMarket(scoreAddress).outcomeCount(), 10);
    }

    function testMultiOutcomeBuyFinalizeRedeem() public {
        (address marketAddress, bytes32 multiMarketId, bytes32 multiConditionId) = factory.createMarket(
            "fixture:demo-2026-001:match_winner_multi",
            "demo-2026-001",
            0,
            5400,
            closeTime,
            keccak256("match-winner"),
            3
        );
        WorldCupMarket multi = WorldCupMarket(marketAddress);
        vm.prank(userA);
        usdc.approve(address(multi), type(uint256).max);
        vm.prank(userA);
        multi.buy(2, 100_000_000, 1);
        assertEq(ctf.balanceOf(ctf.getPositionId(multiConditionId, 2), userA), 100_000_000);
        oracle.proposeResult(address(multi), _payloadFor(multiMarketId, 2));
        vm.warp(block.timestamp + 700);
        oracle.finalize(multiMarketId);
        vm.prank(userA);
        uint256 paid = multi.redeem(2, 100_000_000);
        assertEq(paid, 100_000_000);
    }

    function testBuyYesAndNoOutcomeShares() public {
        vm.prank(userA);
        market.buy(0, 100_000_000, 100_000_000);
        vm.prank(userB);
        market.buy(1, 150_000_000, 150_000_000);
        assertEq(ctf.balanceOf(ctf.getPositionId(conditionId, 0), userA), 100_000_000);
        assertEq(ctf.balanceOf(ctf.getPositionId(conditionId, 1), userB), 150_000_000);
        assertEq(market.volume(), 250_000_000);
    }

    function testWindowTradingCloseRejectsBuys() public {
        vm.warp(closeTime + 1);
        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.TradingClosed.selector);
        market.buy(0, 100_000_000, 1);
    }

    function testProposeResultCannotFinalizeBeforeChallengeDeadline() public {
        _buyBothSides();
        oracle.proposeResult(address(market), _payload(0));
        vm.expectRevert(OptimisticResultOracle.ChallengeWindowOpen.selector);
        oracle.finalize(marketId);
    }

    function testChallengeBlocksAutomaticFinalize() public {
        _buyBothSides();
        oracle.proposeResult(address(market), _payload(0));
        oracle.challenge(marketId, "wrong goal event", "demo://challenge");
        vm.warp(block.timestamp + 700);
        vm.expectRevert(OptimisticResultOracle.ProposalChallenged.selector);
        oracle.finalize(marketId);
    }

    function testFinalizeMakesWinningYesRedeemableAndLoserPayoutZero() public {
        _buyBothSides();
        oracle.proposeResult(address(market), _payload(0));
        vm.warp(block.timestamp + 700);
        oracle.finalize(marketId);
        uint256 userABefore = usdc.balanceOf(userA);
        uint256 userBBefore = usdc.balanceOf(userB);
        vm.prank(userA);
        uint256 paidA = market.redeem(0, 100_000_000);
        vm.prank(userB);
        uint256 paidB = market.redeem(1, 100_000_000);
        assertEq(paidA, 100_000_000);
        assertEq(paidB, 0);
        assertEq(usdc.balanceOf(userA), userABefore + 100_000_000);
        assertEq(usdc.balanceOf(userB), userBBefore);
    }

    function testNoOutcomeCanWinAndRedeem() public {
        _buyBothSides();
        oracle.proposeResult(address(market), _payload(1));
        vm.warp(block.timestamp + 700);
        oracle.finalize(marketId);
        vm.prank(userB);
        uint256 paid = market.redeem(1, 100_000_000);
        assertEq(paid, 100_000_000);
    }

    function testVoidMarketAllowsRefund() public {
        vm.prank(userA);
        market.buy(0, 100_000_000, 1);
        oracle.voidMarket(address(market), marketId);
        uint256 beforeRefund = usdc.balanceOf(userA);
        vm.prank(userA);
        uint256 paid = market.refund(0, 100_000_000);
        assertEq(paid, 100_000_000);
        assertEq(usdc.balanceOf(userA), beforeRefund + 100_000_000);
    }

    function testOracleVoidMarketRequiresOwner() public {
        vm.prank(userA);
        vm.expectRevert(OptimisticResultOracle.NotOwner.selector);
        oracle.voidMarket(address(market), marketId);
    }


    function testFactoryRejectsNonOwnerAndInvalidOutcomeCount() public {
        vm.prank(userA);
        vm.expectRevert(WorldCupMarketFactory.NotOwner.selector);
        factory.createMarket("fixture:demo-2026-002:goal_window:3780:4380", "demo-2026-002", 3780, 4380, closeTime, keccak256("x"), 2);

        vm.expectRevert(WorldCupMarketFactory.InvalidOutcomeCount.selector);
        factory.createMarket("fixture:demo-2026-003:goal_window:3780:4380", "demo-2026-003", 3780, 4380, closeTime, keccak256("x"), 1);
    }

    function testBuySellAndTradingValidationErrors() public {
        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.InvalidOutcome.selector);
        market.buy(2, 100_000_000, 1);

        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.SlippageExceeded.selector);
        market.buy(0, 100_000_000, 200_000_000);

        vm.prank(userA);
        market.buy(0, 100_000_000, 1);
        vm.prank(userA);
        uint256 sold = market.sell(0, 50_000_000, 50_000_000);
        assertEq(sold, 50_000_000);

        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.InvalidOutcome.selector);
        market.sell(2, 1, 1);

        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.SlippageExceeded.selector);
        market.sell(0, 1, 2);
    }

    function testMockUsdcValidationErrors() public {
        vm.expectRevert(MockUSDC.ZeroAddress.selector);
        usdc.mint(address(0), 1);

        vm.prank(address(0xCAFE));
        vm.expectRevert(MockUSDC.InsufficientBalance.selector);
        usdc.transfer(userA, 1);

        vm.prank(userA);
        usdc.approve(address(market), 1);
        vm.prank(address(market));
        vm.expectRevert(MockUSDC.InsufficientAllowance.selector);
        usdc.transferFrom(userA, address(market), 2);
    }

    function testConditionalTokensValidationErrors() public {
        ConditionalTokensLite isolated = new ConditionalTokensLite();
        vm.prank(userA);
        vm.expectRevert(ConditionalTokensLite.NotOwner.selector);
        isolated.setMarket(userA, true);

        vm.expectRevert(ConditionalTokensLite.InvalidOutcomeCount.selector);
        isolated.prepareCondition(keccak256("bad"), 1);

        isolated.prepareCondition(keccak256("ok"), 2);
        vm.expectRevert(ConditionalTokensLite.ConditionAlreadyPrepared.selector);
        isolated.prepareCondition(keccak256("ok"), 2);

        vm.expectRevert(ConditionalTokensLite.NotMarket.selector);
        isolated.mintPosition(userA, keccak256("missing"), 0, 1);
    }

    function testOracleValidationErrorsAndAdminResolve() public {
        _buyBothSides();
        OptimisticResultOracle.ResultPayload memory badPayload = _payload(2);
        vm.expectRevert(OptimisticResultOracle.InvalidOutcome.selector);
        oracle.proposeResult(address(market), badPayload);

        vm.expectRevert(OptimisticResultOracle.ProposalMissing.selector);
        oracle.finalize(keccak256("missing"));

        oracle.proposeResult(address(market), _payload(0));
        vm.expectRevert(OptimisticResultOracle.ProposalExists.selector);
        oracle.proposeResult(address(market), _payload(0));

        oracle.challenge(marketId, "wrong", "demo://challenge");
        vm.prank(userA);
        vm.expectRevert(OptimisticResultOracle.NotOwner.selector);
        oracle.adminResolve(marketId, 1);

        vm.expectRevert(OptimisticResultOracle.InvalidOutcome.selector);
        oracle.adminResolve(marketId, 2);

        oracle.adminResolve(marketId, 1);
        vm.expectRevert(OptimisticResultOracle.AlreadyFinalized.selector);
        oracle.finalize(marketId);
        vm.expectRevert(OptimisticResultOracle.AlreadyFinalized.selector);
        oracle.challenge(marketId, "late", "demo://late");
    }

    function testRedeemAndRefundValidationErrors() public {
        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.NotRedeemable.selector);
        market.redeem(0, 1);

        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.NotVoid.selector);
        market.refund(0, 1);

        _buyBothSides();
        oracle.proposeResult(address(market), _payload(0));
        vm.warp(block.timestamp + 700);
        oracle.finalize(marketId);

        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.InvalidOutcome.selector);
        market.redeem(2, 1);

        vm.prank(userA);
        vm.expectRevert(ConditionalTokensLite.InsufficientShares.selector);
        market.redeem(0, 999_999_999);
    }



    function testConditionalTokensPreparedMarketValidationBranches() public {
        ConditionalTokensLite isolated = new ConditionalTokensLite();
        CtfMarketHarness harness = new CtfMarketHarness(isolated);
        isolated.setMarket(address(harness), true);
        bytes32 localCondition = isolated.prepareCondition(keccak256("branch"), 2);

        vm.expectRevert(ConditionalTokensLite.ConditionNotPrepared.selector);
        harness.mint(userA, keccak256("missing"), 0, 1);

        vm.expectRevert(ConditionalTokensLite.InvalidOutcomeCount.selector);
        harness.mint(userA, localCondition, 3, 1);

        uint256[] memory wrongLength = new uint256[](1);
        wrongLength[0] = 1;
        vm.expectRevert(ConditionalTokensLite.InvalidPayoutVector.selector);
        harness.report(localCondition, wrongLength);

        uint256[] memory zeroVector = new uint256[](2);
        vm.expectRevert(ConditionalTokensLite.InvalidPayoutVector.selector);
        harness.report(localCondition, zeroVector);

        harness.mint(userA, localCondition, 0, 2);
        vm.expectRevert(ConditionalTokensLite.InsufficientShares.selector);
        harness.burn(userA, localCondition, 0, 3);
    }

    function testMarketOracleAndVoidPermissionBranches() public {
        vm.expectRevert(WorldCupMarket.NotOracle.selector);
        market.markResultProposed();
        vm.expectRevert(WorldCupMarket.NotOracle.selector);
        market.markChallenged();
        vm.expectRevert(WorldCupMarket.NotOracle.selector);
        market.finalizeResult(0);

        vm.prank(address(oracle));
        vm.expectRevert(WorldCupMarket.InvalidOutcome.selector);
        market.finalizeResult(2);

        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.NotFactoryOrOracle.selector);
        market.voidMarket();

        vm.prank(address(oracle));
        market.voidMarket();
        vm.prank(userA);
        vm.expectRevert(WorldCupMarket.InvalidOutcome.selector);
        market.refund(2, 1);
    }

    function testMockUsdcAdditionalBranches() public {
        vm.prank(userA);
        vm.expectRevert(MockUSDC.ZeroAddress.selector);
        usdc.transfer(address(0), 1);

        vm.prank(userA);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(address(market));
        usdc.transferFrom(userA, address(market), 1);
        assertEq(usdc.allowance(userA, address(market)), type(uint256).max);
    }

    function testOracleMissingAndFinalizedBranches() public {
        vm.expectRevert(OptimisticResultOracle.ProposalMissing.selector);
        oracle.challenge(keccak256("missing"), "none", "demo://none");

        _buyBothSides();
        oracle.proposeResult(address(market), _payload(0));
        vm.warp(block.timestamp + 700);
        oracle.finalize(marketId);
        vm.expectRevert(OptimisticResultOracle.AlreadyFinalized.selector);
        oracle.adminResolve(marketId, 0);
    }



    function testAdditionalCoverageBranches() public {
        ConditionalTokensLite isolated = new ConditionalTokensLite();
        isolated.transferOwnership(userA);
        vm.prank(userA);
        isolated.setMarket(userB, true);
        vm.expectRevert(ConditionalTokensLite.NotOwner.selector);
        isolated.transferOwnership(address(this));

        MockUSDC finite = new MockUSDC();
        finite.mint(userA, 10);
        vm.prank(userA);
        finite.approve(address(this), 2);
        finite.transferFrom(userA, userB, 1);
        assertEq(finite.allowance(userA, address(this)), 1);

        vm.expectRevert(OptimisticResultOracle.ProposalMissing.selector);
        oracle.adminResolve(keccak256("missing-admin"), 0);
    }


    function _buyBothSides() internal {
        vm.prank(userA);
        market.buy(0, 100_000_000, 1);
        vm.prank(userB);
        market.buy(1, 100_000_000, 1);
    }

    function _payload(uint8 winningOutcome) internal view returns (OptimisticResultOracle.ResultPayload memory) {
        return _payloadFor(marketId, winningOutcome);
    }

    function _payloadFor(bytes32 payloadMarketId, uint8 winningOutcome) internal pure returns (OptimisticResultOracle.ResultPayload memory) {
        return OptimisticResultOracle.ResultPayload({
            marketId: payloadMarketId,
            winningOutcome: winningOutcome,
            homeScore: 1,
            awayScore: 0,
            dataSourceHash: keccak256("demo-events"),
            evidenceUri: "demo://fixture/demo-2026-001/events"
        });
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }

    function assertTrue(bool value) internal pure {
        require(value, "not true");
    }
}
