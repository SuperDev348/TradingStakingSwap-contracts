// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract RewardManager is Governable {

    bool public isInitialized;

    ITimelock public timelock;
    address public rewardRouter;

    address public xpcManager;

    address public stakedOpecTracker;
    address public bonusOpecTracker;
    address public feeOpecTracker;

    address public feeXpcTracker;
    address public stakedXpcTracker;

    address public stakedOpecDistributor;
    address public stakedXpcDistributor;

    address public esOpec;
    address public bnOpec;

    address public opecVester;
    address public xpcVester;

    function initialize(
        ITimelock _timelock,
        address _rewardRouter,
        address _xpcManager,
        address _stakedOpecTracker,
        address _bonusOpecTracker,
        address _feeOpecTracker,
        address _feeXpcTracker,
        address _stakedXpcTracker,
        address _stakedOpecDistributor,
        address _stakedXpcDistributor,
        address _esOpec,
        address _bnOpec,
        address _opecVester,
        address _xpcVester
    ) external onlyGov {
        require(!isInitialized, "RewardManager: already initialized");
        isInitialized = true;

        timelock = _timelock;
        rewardRouter = _rewardRouter;

        xpcManager = _xpcManager;

        stakedOpecTracker = _stakedOpecTracker;
        bonusOpecTracker = _bonusOpecTracker;
        feeOpecTracker = _feeOpecTracker;

        feeXpcTracker = _feeXpcTracker;
        stakedXpcTracker = _stakedXpcTracker;

        stakedOpecDistributor = _stakedOpecDistributor;
        stakedXpcDistributor = _stakedXpcDistributor;

        esOpec = _esOpec;
        bnOpec = _bnOpec;

        opecVester = _opecVester;
        xpcVester = _xpcVester;
    }

    function updateEsOpecHandlers() external onlyGov {
        timelock.managedSetHandler(esOpec, rewardRouter, true);

        timelock.managedSetHandler(esOpec, stakedOpecDistributor, true);
        timelock.managedSetHandler(esOpec, stakedXpcDistributor, true);

        timelock.managedSetHandler(esOpec, stakedOpecTracker, true);
        timelock.managedSetHandler(esOpec, stakedXpcTracker, true);

        timelock.managedSetHandler(esOpec, opecVester, true);
        timelock.managedSetHandler(esOpec, xpcVester, true);
    }

    function enableRewardRouter() external onlyGov {
        timelock.managedSetHandler(xpcManager, rewardRouter, true);

        timelock.managedSetHandler(stakedOpecTracker, rewardRouter, true);
        timelock.managedSetHandler(bonusOpecTracker, rewardRouter, true);
        timelock.managedSetHandler(feeOpecTracker, rewardRouter, true);

        timelock.managedSetHandler(feeXpcTracker, rewardRouter, true);
        timelock.managedSetHandler(stakedXpcTracker, rewardRouter, true);

        timelock.managedSetHandler(esOpec, rewardRouter, true);

        timelock.managedSetMinter(bnOpec, rewardRouter, true);

        timelock.managedSetMinter(esOpec, opecVester, true);
        timelock.managedSetMinter(esOpec, xpcVester, true);

        timelock.managedSetHandler(opecVester, rewardRouter, true);
        timelock.managedSetHandler(xpcVester, rewardRouter, true);

        timelock.managedSetHandler(feeOpecTracker, opecVester, true);
        timelock.managedSetHandler(stakedXpcTracker, xpcVester, true);
    }
}
