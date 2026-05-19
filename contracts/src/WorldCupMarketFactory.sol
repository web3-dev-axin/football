// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "./MockUSDC.sol";
import {ConditionalTokensLite} from "./ConditionalTokensLite.sol";
import {WorldCupMarket} from "./WorldCupMarket.sol";

contract WorldCupMarketFactory {
    MockUSDC public immutable collateral;
    ConditionalTokensLite public immutable ctf;
    address public immutable oracle;
    address public owner;
    mapping(bytes32 => address) public marketById;
    mapping(bytes32 => bool) public usedMarketKeyHash;

    event MarketCreated(
        bytes32 indexed marketId,
        string marketKey,
        string fixtureId,
        uint256 windowStartMatchSecond,
        uint256 windowEndMatchSecond,
        address market,
        bytes32 conditionId,
        uint256 outcomeCount
    );

    error NotOwner();
    error DuplicateMarket();
    error InvalidOutcomeCount();

    constructor(MockUSDC collateral_, ConditionalTokensLite ctf_, address oracle_) {
        collateral = collateral_;
        ctf = ctf_;
        oracle = oracle_;
        owner = msg.sender;
    }

    function createMarket(
        string calldata marketKey,
        string calldata fixtureId,
        uint256 windowStartMatchSecond,
        uint256 windowEndMatchSecond,
        uint256 closeTime,
        bytes32 resolutionPolicyHash,
        uint256 outcomeCount
    ) external returns (address market, bytes32 marketId, bytes32 conditionId) {
        if (msg.sender != owner) revert NotOwner();
        if (outcomeCount < 2 || outcomeCount > 16) revert InvalidOutcomeCount();
        bytes32 keyHash = keccak256(bytes(marketKey));
        if (usedMarketKeyHash[keyHash]) revert DuplicateMarket();
        usedMarketKeyHash[keyHash] = true;
        marketId = keccak256(abi.encode(block.chainid, keyHash));
        conditionId = ctf.prepareCondition(keccak256(abi.encode(marketId, resolutionPolicyHash)), outcomeCount);
        WorldCupMarket deployed = new WorldCupMarket(
            collateral,
            ctf,
            oracle,
            marketId,
            conditionId,
            marketKey,
            fixtureId,
            windowStartMatchSecond,
            windowEndMatchSecond,
            closeTime,
            outcomeCount
        );
        market = address(deployed);
        marketById[marketId] = market;
        ctf.setMarket(market, true);
        emit MarketCreated(marketId, marketKey, fixtureId, windowStartMatchSecond, windowEndMatchSecond, market, conditionId, outcomeCount);
    }
}
