// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "./MockUSDC.sol";
import {ConditionalTokensLite} from "./ConditionalTokensLite.sol";

contract WorldCupMarket {
    enum Status {
        LiveTrading,
        Closed,
        ResultProposed,
        Challenged,
        Redeemable,
        Voided
    }

    MockUSDC public immutable collateral;
    ConditionalTokensLite public immutable ctf;
    address public immutable oracle;
    address public immutable factory;
    bytes32 public immutable marketId;
    bytes32 public immutable conditionId;
    string public marketKey;
    string public fixtureId;
    uint256 public immutable windowStartMatchSecond;
    uint256 public immutable windowEndMatchSecond;
    uint256 public immutable closeTime;
    uint256 public volume;
    uint8 public winningOutcome;
    Status public status;

    event TradeExecuted(bytes32 indexed marketId, address indexed trader, uint256 indexed outcomeIndex, uint256 collateralAmount, uint256 sharesAmount, uint8 tradeType);
    event ResultProposed(bytes32 indexed marketId);
    event ResultChallenged(bytes32 indexed marketId);
    event ResultFinalized(bytes32 indexed marketId, uint8 winningOutcome, uint256[] payoutNumerators, uint256 payoutDenominator);
    event MarketVoided(bytes32 indexed marketId);
    event Redeemed(bytes32 indexed marketId, address indexed user, uint256 indexed outcomeIndex, uint256 sharesBurned, uint256 collateralPaid);

    error InvalidOutcome();
    error TradingClosed();
    error SlippageExceeded();
    error NotOracle();
    error NotFactoryOrOracle();
    error NotRedeemable();
    error NotVoid();

    constructor(
        MockUSDC collateral_,
        ConditionalTokensLite ctf_,
        address oracle_,
        bytes32 marketId_,
        bytes32 conditionId_,
        string memory marketKey_,
        string memory fixtureId_,
        uint256 windowStartMatchSecond_,
        uint256 windowEndMatchSecond_,
        uint256 closeTime_
    ) {
        collateral = collateral_;
        ctf = ctf_;
        oracle = oracle_;
        factory = msg.sender;
        marketId = marketId_;
        conditionId = conditionId_;
        marketKey = marketKey_;
        fixtureId = fixtureId_;
        windowStartMatchSecond = windowStartMatchSecond_;
        windowEndMatchSecond = windowEndMatchSecond_;
        closeTime = closeTime_;
        status = Status.LiveTrading;
    }

    function buy(uint256 outcomeIndex, uint256 collateralAmount, uint256 minSharesOut) external returns (uint256 sharesOut) {
        _requireTradingOpen();
        if (outcomeIndex > 1) revert InvalidOutcome();
        sharesOut = collateralAmount;
        if (sharesOut < minSharesOut) revert SlippageExceeded();
        collateral.transferFrom(msg.sender, address(this), collateralAmount);
        ctf.mintPosition(msg.sender, conditionId, outcomeIndex, sharesOut);
        volume += collateralAmount;
        emit TradeExecuted(marketId, msg.sender, outcomeIndex, collateralAmount, sharesOut, 0);
    }

    function sell(uint256 outcomeIndex, uint256 sharesAmount, uint256 minCollateralOut) external returns (uint256 collateralOut) {
        _requireTradingOpen();
        if (outcomeIndex > 1) revert InvalidOutcome();
        collateralOut = sharesAmount;
        if (collateralOut < minCollateralOut) revert SlippageExceeded();
        ctf.burnPosition(msg.sender, conditionId, outcomeIndex, sharesAmount);
        collateral.transfer(msg.sender, collateralOut);
        emit TradeExecuted(marketId, msg.sender, outcomeIndex, collateralOut, sharesAmount, 1);
    }

    function markResultProposed() external onlyOracle {
        status = Status.ResultProposed;
        emit ResultProposed(marketId);
    }

    function markChallenged() external onlyOracle {
        status = Status.Challenged;
        emit ResultChallenged(marketId);
    }

    function finalizeResult(uint8 winningOutcome_) external onlyOracle {
        if (winningOutcome_ > 1) revert InvalidOutcome();
        winningOutcome = winningOutcome_;
        status = Status.Redeemable;
        uint256[] memory payouts = new uint256[](2);
        payouts[winningOutcome_] = 1;
        ctf.reportPayouts(conditionId, payouts);
        emit ResultFinalized(marketId, winningOutcome_, payouts, 1);
    }

    function voidMarket() external {
        if (msg.sender != oracle && msg.sender != factory) revert NotFactoryOrOracle();
        status = Status.Voided;
        emit MarketVoided(marketId);
    }

    function redeem(uint256 outcomeIndex, uint256 sharesAmount) external returns (uint256 collateralPaid) {
        if (status != Status.Redeemable) revert NotRedeemable();
        if (outcomeIndex > 1) revert InvalidOutcome();
        ctf.burnPosition(msg.sender, conditionId, outcomeIndex, sharesAmount);
        collateralPaid = outcomeIndex == winningOutcome ? sharesAmount : 0;
        if (collateralPaid > 0) collateral.transfer(msg.sender, collateralPaid);
        emit Redeemed(marketId, msg.sender, outcomeIndex, sharesAmount, collateralPaid);
    }

    function refund(uint256 outcomeIndex, uint256 sharesAmount) external returns (uint256 collateralPaid) {
        if (status != Status.Voided) revert NotVoid();
        if (outcomeIndex > 1) revert InvalidOutcome();
        ctf.burnPosition(msg.sender, conditionId, outcomeIndex, sharesAmount);
        collateralPaid = sharesAmount;
        collateral.transfer(msg.sender, collateralPaid);
        emit Redeemed(marketId, msg.sender, outcomeIndex, sharesAmount, collateralPaid);
    }

    function _requireTradingOpen() internal view {
        if (block.timestamp >= closeTime || status != Status.LiveTrading) revert TradingClosed();
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }
}
