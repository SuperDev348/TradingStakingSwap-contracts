const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("Bridge", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let opec
  let wopec
  let bridge

  beforeEach(async () => {
    opec = await deployContract("OPEC", [])
    wopec = await deployContract("OPEC", [])
    bridge = await deployContract("Bridge", [opec.address, wopec.address])
  })

  it("wrap, unwrap", async () => {
    await opec.setMinter(wallet.address, true)
    await opec.mint(user0.address, 100)
    await opec.connect(user0).approve(bridge.address, 100)
    await expect(bridge.connect(user0).wrap(200, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await expect(bridge.connect(user0).wrap(100, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await wopec.setMinter(wallet.address, true)
    await wopec.mint(bridge.address, 50)

    await expect(bridge.connect(user0).wrap(100, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await wopec.mint(bridge.address, 50)

    expect(await opec.balanceOf(user0.address)).eq(100)
    expect(await opec.balanceOf(bridge.address)).eq(0)
    expect(await wopec.balanceOf(user1.address)).eq(0)
    expect(await wopec.balanceOf(bridge.address)).eq(100)

    await bridge.connect(user0).wrap(100, user1.address)

    expect(await opec.balanceOf(user0.address)).eq(0)
    expect(await opec.balanceOf(bridge.address)).eq(100)
    expect(await wopec.balanceOf(user1.address)).eq(100)
    expect(await wopec.balanceOf(bridge.address)).eq(0)

    await wopec.connect(user1).approve(bridge.address, 100)

    expect(await opec.balanceOf(user2.address)).eq(0)
    expect(await opec.balanceOf(bridge.address)).eq(100)
    expect(await wopec.balanceOf(user1.address)).eq(100)
    expect(await wopec.balanceOf(bridge.address)).eq(0)

    await bridge.connect(user1).unwrap(100, user2.address)

    expect(await opec.balanceOf(user2.address)).eq(100)
    expect(await opec.balanceOf(bridge.address)).eq(0)
    expect(await wopec.balanceOf(user1.address)).eq(0)
    expect(await wopec.balanceOf(bridge.address)).eq(100)
  })

  it("withdrawToken", async () => {
    await opec.setMinter(wallet.address, true)
    await opec.mint(bridge.address, 100)

    await expect(bridge.connect(user0).withdrawToken(opec.address, user1.address, 100))
      .to.be.revertedWith("Governable: forbidden")

    await expect(bridge.connect(user0).setGov(user0.address))
      .to.be.revertedWith("Governable: forbidden")

    await bridge.connect(wallet).setGov(user0.address)

    expect(await opec.balanceOf(user1.address)).eq(0)
    expect(await opec.balanceOf(bridge.address)).eq(100)
    await bridge.connect(user0).withdrawToken(opec.address, user1.address, 100)
    expect(await opec.balanceOf(user1.address)).eq(100)
    expect(await opec.balanceOf(bridge.address)).eq(0)
  })
})
