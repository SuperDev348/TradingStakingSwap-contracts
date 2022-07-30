// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../libraries/utils/Address.sol";

import "./interfaces/IRewardTracker.sol";
import "./interfaces/IVester.sol";
import "../tokens/interfaces/IMintable.sol";
import "../tokens/interfaces/IWETH.sol";
import "../core/interfaces/IXpcManager.sol";
import "../access/Governable.sol";

contract RewardRouterV2 is ReentrancyGuard, Governable {
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

    address public opecVester;
    address public xpcVester;

    mapping (address => address) public pendingReceivers;

    event StakeOpec(address account, address token, uint256 amount);
    event UnstakeOpec(address account, address token, uint256 amount);

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
        address _xpcManager,
        address _opecVester,
        address _xpcVester
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

        opecVester = _opecVester;
        xpcVester = _xpcVester;
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
        _unstakeOpec(msg.sender, opec, _amount, true);
    }

    function unstakeEsOpec(uint256 _amount) external nonReentrant {
        _unstakeOpec(msg.sender, esOpec, _amount, true);
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

    function handleRewards(
        bool _shouldClaimOpec,
        bool _shouldStakeOpec,
        bool _shouldClaimEsOpec,
        bool _shouldStakeEsOpec,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        address account = msg.sender;

        uint256 opecAmount = 0;
        if (_shouldClaimOpec) {
            uint256 opecAmount0 = IVester(opecVester).claimForAccount(account, account);
            uint256 opecAmount1 = IVester(xpcVester).claimForAccount(account, account);
            opecAmount = opecAmount0.add(opecAmount1);
        }

        if (_shouldStakeOpec && opecAmount > 0) {
            _stakeOpec(account, account, opec, opecAmount);
        }

        uint256 esOpecAmount = 0;
        if (_shouldClaimEsOpec) {
            uint256 esOpecAmount0 = IRewardTracker(stakedOpecTracker).claimForAccount(account, account);
            uint256 esOpecAmount1 = IRewardTracker(stakedXpcTracker).claimForAccount(account, account);
            esOpecAmount = esOpecAmount0.add(esOpecAmount1);
        }

        if (_shouldStakeEsOpec && esOpecAmount > 0) {
            _stakeOpec(account, account, esOpec, esOpecAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            uint256 bnOpecAmount = IRewardTracker(bonusOpecTracker).claimForAccount(account, account);
            if (bnOpecAmount > 0) {
                IRewardTracker(feeOpecTracker).stakeForAccount(account, account, bnOpec, bnOpecAmount);
            }
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 weth0 = IRewardTracker(feeOpecTracker).claimForAccount(account, address(this));
                uint256 weth1 = IRewardTracker(feeXpcTracker).claimForAccount(account, address(this));

                uint256 wethAmount = weth0.add(weth1);
                IWETH(weth).withdraw(wethAmount);

                payable(account).sendValue(wethAmount);
            } else {
                IRewardTracker(feeOpecTracker).claimForAccount(account, account);
                IRewardTracker(feeXpcTracker).claimForAccount(account, account);
            }
        }
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
    }

    function signalTransfer(address _receiver) external nonReentrant {
        require(IERC20(opecVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(xpcVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");

        _validateReceiver(_receiver);
        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        require(IERC20(opecVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(xpcVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");

        address receiver = msg.sender;
        require(pendingReceivers[_sender] == receiver, "RewardRouter: transfer not signalled");
        delete pendingReceivers[_sender];

        _validateReceiver(receiver);
        _compound(_sender);

        uint256 stakedOpec = IRewardTracker(stakedOpecTracker).depositBalances(_sender, opec);
        if (stakedOpec > 0) {
            _unstakeOpec(_sender, opec, stakedOpec, false);
            _stakeOpec(_sender, receiver, opec, stakedOpec);
        }

        uint256 stakedEsOpec = IRewardTracker(stakedOpecTracker).depositBalances(_sender, esOpec);
        if (stakedEsOpec > 0) {
            _unstakeOpec(_sender, esOpec, stakedEsOpec, false);
            _stakeOpec(_sender, receiver, esOpec, stakedEsOpec);
        }

        uint256 stakedBnOpec = IRewardTracker(feeOpecTracker).depositBalances(_sender, bnOpec);
        if (stakedBnOpec > 0) {
            IRewardTracker(feeOpecTracker).unstakeForAccount(_sender, bnOpec, stakedBnOpec, _sender);
            IRewardTracker(feeOpecTracker).stakeForAccount(_sender, receiver, bnOpec, stakedBnOpec);
        }

        uint256 esOpecBalance = IERC20(esOpec).balanceOf(_sender);
        if (esOpecBalance > 0) {
            IERC20(esOpec).transferFrom(_sender, receiver, esOpecBalance);
        }

        uint256 xpcAmount = IRewardTracker(feeXpcTracker).depositBalances(_sender, xpc);
        if (xpcAmount > 0) {
            IRewardTracker(stakedXpcTracker).unstakeForAccount(_sender, feeXpcTracker, xpcAmount, _sender);
            IRewardTracker(feeXpcTracker).unstakeForAccount(_sender, xpc, xpcAmount, _sender);

            IRewardTracker(feeXpcTracker).stakeForAccount(_sender, receiver, xpc, xpcAmount);
            IRewardTracker(stakedXpcTracker).stakeForAccount(receiver, receiver, feeXpcTracker, xpcAmount);
        }

        IVester(opecVester).transferStakeValues(_sender, receiver);
        IVester(xpcVester).transferStakeValues(_sender, receiver);
    }

    function _validateReceiver(address _receiver) private view {
        require(IRewardTracker(stakedOpecTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedOpecTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedOpecTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedOpecTracker.cumulativeRewards > 0");

        require(IRewardTracker(bonusOpecTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: bonusOpecTracker.averageStakedAmounts > 0");
        require(IRewardTracker(bonusOpecTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: bonusOpecTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeOpecTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeOpecTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeOpecTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeOpecTracker.cumulativeRewards > 0");

        require(IVester(opecVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: opecVester.transferredAverageStakedAmounts > 0");
        require(IVester(opecVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: opecVester.transferredCumulativeRewards > 0");

        require(IRewardTracker(stakedXpcTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedXpcTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedXpcTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedXpcTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeXpcTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeXpcTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeXpcTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeXpcTracker.cumulativeRewards > 0");

        require(IVester(xpcVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: opecVester.transferredAverageStakedAmounts > 0");
        require(IVester(xpcVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: opecVester.transferredCumulativeRewards > 0");

        require(IERC20(opecVester).balanceOf(_receiver) == 0, "RewardRouter: opecVester.balance > 0");
        require(IERC20(xpcVester).balanceOf(_receiver) == 0, "RewardRouter: xpcVester.balance > 0");
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

        emit StakeOpec(_account, _token, _amount);
    }

    function _unstakeOpec(address _account, address _token, uint256 _amount, bool _shouldReduceBnOpec) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        uint256 balance = IRewardTracker(stakedOpecTracker).stakedAmounts(_account);

        IRewardTracker(feeOpecTracker).unstakeForAccount(_account, bonusOpecTracker, _amount, _account);
        IRewardTracker(bonusOpecTracker).unstakeForAccount(_account, stakedOpecTracker, _amount, _account);
        IRewardTracker(stakedOpecTracker).unstakeForAccount(_account, _token, _amount, _account);

        if (_shouldReduceBnOpec) {
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
        }

        emit UnstakeOpec(_account, _token, _amount);
    }
}
