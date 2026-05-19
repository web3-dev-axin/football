// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "../src/MockUSDC.sol";
import {ConditionalTokensLite} from "../src/ConditionalTokensLite.sol";
import {OptimisticResultOracle} from "../src/OptimisticResultOracle.sol";
import {WorldCupMarketFactory} from "../src/WorldCupMarketFactory.sol";

contract Deploy {
    function run() external returns (MockUSDC usdc, ConditionalTokensLite ctf, OptimisticResultOracle oracle, WorldCupMarketFactory factory) {
        usdc = new MockUSDC();
        ctf = new ConditionalTokensLite();
        oracle = new OptimisticResultOracle(600);
        factory = new WorldCupMarketFactory(usdc, ctf, address(oracle));
        ctf.transferOwnership(address(factory));
    }
}
