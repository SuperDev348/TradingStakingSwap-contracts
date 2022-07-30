// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../libraries/utils/Address.sol";

import "./interfaces/IRewardTracker.sol";
import "../tokens/interfaces/IMintable.sol";
import "../tokens/interfaces/IWETH.sol";
import "../core/interfaces/IXpcManager.sol";
import "../access/Governable.sol";

contract RewardRouter is ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    bool public isInitialized;

    address public weth;

    address public opec;
    address public esOpec;
    address public bnOpec;

    address public xpc; // OPEC Liquidity Provider token

    address public stakedOpecTracker;
    address public bonusOpecTracker;
    address public feeOpecTracker;

    address public stakedXpcTracker;
    address public feeXpcTracker;

    address public xpcManager;

    event StakeOpec(address account, uint256 amount);
    event UnstakeOpec(address account, uint256 amount);

    event StakeXpc(address account, uint256 amount);
    event UnstakeXpc(address account, uint256 amount);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(
        address _weth,
        address _opec,
        address _esOpec,
        address _bnOpec,
        address _xpc,
        address _stakedOpecTracker,
        address _bonusOpecTracker,
        address _feeOpecTracker,
        address _feeXpcTracker,
        address _stakedXpcTracker,
        address _xpcManager
    ) external onlyGov {
        require(!isInitialized, "RewardRouter: already initialized");
        isInitialized = true;

        weth = _weth;

        opec = _opec;
        esOpec = _esOpec;
        bnOpec = _bnOpec;

        xpc = _xpc;

        stakedOpecTracker = _stakedOpecTracker;
        bonusOpecTracker = _bonusOpecTracker;
        feeOpecTracker = _feeOpecTracker;

        feeXpcTracker = _feeXpcTracker;
        stakedXpcTracker = _stakedXpcTracker;

        xpcManager = _xpcManager;
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function batchStakeOpecForAccount(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyGov {
        address _opec = opec;
        for (uint256 i = 0; i < _accounts.length; i++) {
            _stakeOpec(msg.sender, _accounts[i], _opec, _amounts[i]);
        }
    }

    function stakeOpecForAccount(address _account, uint256 _amount) external nonReentrant onlyGov {
        _stakeOpec(msg.sender, _account, opec, _amount);
    }

    function stakeOpec(uint256 _amount) external nonReentrant {
        _stakeOpec(msg.sender, msg.sender, opec, _amount);
    }

    function stakeEsOpec(uint256 _amount) external nonReentrant {
        _stakeOpec(msg.sender, msg.sender, esOpec, _amount);
    }

    function unstakeOpec(uint256 _amount) external nonReentrant {
        _unstakeOpec(msg.sender, opec, _amount);
    }

    function unstakeEsOpec(uint256 _amount) external nonReentrant {
        _unstakeOpec(msg.sender, esOpec, _amount);
    }

    function mintAndStakeXpc(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minXpc) external nonReentrant returns (uint256) {
        require(_amount > 0, "RewardRouter: invalid _amount");

        address account = msg.sender;
        uint256 xpcAmount = IXpcManager(xpcManager).addLiquidityForAccount(account, account, _token, _amount, _minUsdg, _minXpc);
        IRewardTracker(feeXpcTracker).stakeForAccount(account, account, xpc, xpcAmount);
        IRewardTracker(stakedXpcTracker).stakeForAccount(account, account, feeXpcTracker, xpcAmount);

        emit StakeXpc(account, xpcAmount);

        return xpcAmount;
    }

    function mintAndStakeXpcETH(uint256 _minUsdg, uint256 _minXpc) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "RewardRouter: invalid msg.value");

        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).approve(xpcManager, msg.value);

        address account = msg.sender;
        uint256 xpcAmount = IXpcManager(xpcManager).addLiquidityForAccount(address(this), account, weth, msg.value, _minUsdg, _minXpc);

        IRewardTracker(feeXpcTracker).stakeForAccount(account, account, xpc, xpcAmount);
        IRewardTracker(stakedXpcTracker).stakeForAccount(account, account, feeXpcTracker, xpcAmount);

        emit StakeXpc(account, xpcAmount);

        return xpcAmount;
    }

    function unstakeAndRedeemXpc(address _tokenOut, uint256 _xpcAmount, uint256 _minOut, address _receiver) external nonReentrant returns (uint256) {
        require(_xpcAmount > 0, "RewardRouter: invalid _xpcAmount");

        address account = msg.sender;
        IRewardTracker(stakedXpcTracker).unstakeForAccount(account, feeXpcTracker, _xpcAmount, account);
        IRewardTracker(feeXpcTracker).unstakeForAccount(account, xpc, _xpcAmount, account);
        uint256 amountOut = IXpcManager(xpcManager).removeLiquidityForAccount(account, _tokenOut, _xpcAmount, _minOut, _receiver);

        emit UnstakeXpc(account, _xpcAmount);

        return amountOut;
    }

    function unstakeAndRedeemXpcETH(uint256 _xpcAmount, uint256 _minOut, address payable _receiver) external nonReentrant returns (uint256) {
        require(_xpcAmount > 0, "RewardRouter: invalid _xpcAmount");

        address account = msg.sender;
        IRewardTracker(stakedXpcTracker).unstakeForAccount(account, feeXpcTracker, _xpcAmount, account);
        IRewardTracker(feeXpcTracker).unstakeForAccount(account, xpc, _xpcAmount, account);
        uint256 amountOut = IXpcManager(xpcManager).removeLiquidityForAccount(account, weth, _xpcAmount, _minOut, address(this));

        IWETH(weth).withdraw(amountOut);

        _receiver.sendValue(amountOut);

        emit UnstakeXpc(account, _xpcAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(feeOpecTracker).claimForAccount(account, account);
        IRewardTracker(feeXpcTracker).claimForAccount(account, account);

        IRewardTracker(stakedOpecTracker).claimForAccount(account, account);
        IRewardTracker(stakedXpcTracker).claimForAccount(account, account);
    }

    function claimEsOpec() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(stakedOpecTracker).claimForAccount(account, account);
        IRewardTracker(stakedXpcTracker).claimForAccount(account, account);
    }

    function claimFees() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(feeOpecTracker).claimForAccount(account, account);
        IRewardTracker(feeXpcTracker).claimForAccount(account, account);
    }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function compoundForAccount(address _account) external nonReentrant onlyGov {
        _compound(_account);
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
    }

    function _compound(address _account) private {
        _compoundOpec(_account);
        _compoundXpc(_account);
    }

    function _compoundOpec(address _account) private {
        uint256 esOpecAmount = IRewardTracker(stakedOpecTracker).claimForAccount(_account, _account);
        if (esOpecAmount > 0) {
            _stakeOpec(_account, _account, esOpec, esOpecAmount);
        }

        uint256 bnOpecAmount = IRewardTracker(bonusOpecTracker).claimForAccount(_account, _account);
        if (bnOpecAmount > 0) {
            IRewardTracker(feeOpecTracker).stakeForAccount(_account, _account, bnOpec, bnOpecAmount);
        }
    }

    function _compoundXpc(address _account) private {
        uint256 esOpecAmount = IRewardTracker(stakedXpcTracker).claimForAccount(_account, _account);
        if (esOpecAmount > 0) {
            _stakeOpec(_account, _account, esOpec, esOpecAmount);
        }
    }

    function _stakeOpec(address _fundingAccount, address _account, address _token, uint256 _amount) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        IRewardTracker(stakedOpecTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
        IRewardTracker(bonusOpecTracker).stakeForAccount(_account, _account, stakedOpecTracker, _amount);
        IRewardTracker(feeOpecTracker).stakeForAccount(_account, _account, bonusOpecTracker, _amount);

        emit StakeOpec(_account, _amount);
    }

    function _unstakeOpec(address _account, address _token, uint256 _amount) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        uint256 balance = IRewardTracker(stakedOpecTracker).stakedAmounts(_account);

        IRewardTracker(feeOpecTracker).unstakeForAccount(_account, bonusOpecTracker, _amount, _account);
        IRewardTracker(bonusOpecTracker).unstakeForAccount(_account, stakedOpecTracker, _amount, _account);
        IRewardTracker(stakedOpecTracker).unstakeForAccount(_account, _token, _amount, _account);

        uint256 bnOpecAmount = IRewardTracker(bonusOpecTracker).claimForAccount(_account, _account);
        if (bnOpecAmount > 0) {
            IRewardTracker(feeOpecTracker).stakeForAccount(_account, _account, bnOpec, bnOpecAmount);
        }

        uint256 stakedBnOpec = IRewardTracker(feeOpecTracker).depositBalances(_account, bnOpec);
        if (stakedBnOpec > 0) {
            uint256 reductionAmount = stakedBnOpec.mul(_amount).div(balance);
            IRewardTracker(feeOpecTracker).unstakeForAccount(_account, bnOpec, reductionAmount, _account);
            IMintable(bnOpec).burn(_account, reductionAmount);
        }

        emit UnstakeOpec(_account, _amount);
    }
}
