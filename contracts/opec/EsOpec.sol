// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract EsOpec is MintableBaseToken {
    constructor() public MintableBaseToken("Escrowed OPEC", "esOPEC", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "esOPEC";
    }
}
