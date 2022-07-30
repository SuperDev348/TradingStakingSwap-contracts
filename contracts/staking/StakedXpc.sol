// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";

import "../core/interfaces/IXpcManager.sol";

import "./interfaces/IRewardTracker.sol";
import "./interfaces/IRewardTracker.sol";

// provide a way to transfer staked XPC tokens by unstaking from the sender
// and staking for the receiver
// tests in RewardRouterV2.js
contract StakedXpc {
    using SafeMath for uint256;

    string public constant name = "StakedXpc";
    string public constant symbol = "sXPC";
    uint8 public constant decimals = 18;

    address public xpc;
    IXpcManager public xpcManager;
    address public stakedXpcTracker;
    address public feeXpcTracker;

    mapping (address => mapping (address => uint256)) public allowances;

    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        address _xpc,
        IXpcManager _xpcManager,
        address _stakedXpcTracker,
        address _feeXpcTracker
    ) public {
        xpc = _xpc;
        xpcManager = _xpcManager;
        stakedXpcTracker = _stakedXpcTracker;
        feeXpcTracker = _feeXpcTracker;
    }

    function allowance(address _owner, address _spender) external view returns (uint256) {
        return allowances[_owner][_spender];
    }

    function approve(address _spender, uint256 _amount) external returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _recipient, uint256 _amount) external returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) external returns (bool) {
        uint256 nextAllowance = allowances[_sender][msg.sender].sub(_amount, "StakedXpc: transfer amount exceeds allowance");
        _approve(_sender, msg.sender, nextAllowance);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function balanceOf(address _account) external view returns (uint256) {
        IRewardTracker(stakedXpcTracker).depositBalances(_account, xpc);
    }

    function totalSupply() external view returns (uint256) {
        IERC20(stakedXpcTracker).totalSupply();
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_owner != address(0), "StakedXpc: approve from the zero address");
        require(_spender != address(0), "StakedXpc: approve to the zero address");

        allowances[_owner][_spender] = _amount;

        emit Approval(_owner, _spender, _amount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(_sender != address(0), "StakedXpc: transfer from the zero address");
        require(_recipient != address(0), "StakedXpc: transfer to the zero address");

        require(
            xpcManager.lastAddedAt(_sender).add(xpcManager.cooldownDuration()) <= block.timestamp,
            "StakedXpc: cooldown duration not yet passed"
        );

        IRewardTracker(stakedXpcTracker).unstakeForAccount(_sender, feeXpcTracker, _amount, _sender);
        IRewardTracker(feeXpcTracker).unstakeForAccount(_sender, xpc, _amount, _sender);

        IRewardTracker(feeXpcTracker).stakeForAccount(_sender, _recipient, xpc, _amount);
        IRewardTracker(stakedXpcTracker).stakeForAccount(_recipient, _recipient, feeXpcTracker, _amount);
    }
}
