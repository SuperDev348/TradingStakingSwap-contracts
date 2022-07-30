// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract XPC is MintableBaseToken {
    constructor() public MintableBaseToken("XPC LP", "XPC", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "XPC";
    }
}
