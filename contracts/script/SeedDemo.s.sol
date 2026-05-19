// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockUSDC} from "../src/MockUSDC.sol";

contract SeedDemo {
    function mint(MockUSDC usdc, address user, uint256 amount) external {
        usdc.mint(user, amount);
    }
}
