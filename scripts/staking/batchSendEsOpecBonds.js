const { deployContract, contractAt, sendTxn, readCsv } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const path = require('path')
const fs = require('fs')
const parse = require('csv-parse')

const inputDir = path.resolve(__dirname, "../..") + "/data/bonds/"

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const inputFile = inputDir + "2022-06-01_transfers.csv"
const shouldSendTxns = false

async function getArbValues() {
  const esOpec = await contractAt("EsOpec", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const esOpecBatchSender = await contractAt("EsOpecBatchSender", "0xc3828fa579996090Dc7767E051341338e60207eF")

  const vestWithOpecOption = "0x544a6ec142Aa9A7F75235fE111F61eF2EbdC250a"
  const vestWithXpcOption = "0x9d8f6f6eE45275A5Ca3C6f6269c5622b1F9ED515"

  const opecVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const xpcVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")

  return { esOpec, esOpecBatchSender, vestWithOpecOption, vestWithXpcOption, opecVester, xpcVester }
}

async function getAvaxValues() {
  const esOpec = await contractAt("EsOpec", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const esOpecBatchSender = await contractAt("EsOpecBatchSender", "0xc9baFef924159138697e72899a2753a3Dc8D1F4d")
  const vestWithOpecOption = "0x171a321A78dAE0CDC0Ba3409194df955DEEcA746"
  const vestWithXpcOption = "0x28863Dd19fb52DF38A9f2C6dfed40eeB996e3818"

  const opecVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")
  const xpcVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A")

  return { esOpec, esOpecBatchSender, vestWithOpecOption, vestWithXpcOption, opecVester, xpcVester }
}

async function main() {
  const wallet = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }

  const values = network === "arbitrum" ? await getArbValues() : await getAvaxValues()
  const { esOpec, esOpecBatchSender, vestWithOpecOption, vestWithXpcOption, opecVester, xpcVester } = values

  const txns = await readCsv(inputFile)
  console.log("processing list", txns.length)

  const vestWithOpecAccounts = []
  const vestWithOpecAmounts = []

  const vestWithXpcAccounts = []
  const vestWithXpcAmounts = []

  let totalEsOpec = bigNumberify(0)

  for (let i = 0; i < txns.length; i++) {
    const txn = txns[i]
    if (txn.Method !== "Transfer") {
      continue
    }

    const amount = ethers.utils.parseUnits(txn.Quantity, 18)

    if (txn.To.toLowerCase() === vestWithOpecOption.toLowerCase()) {
      vestWithOpecAccounts.push(txn.From)
      vestWithOpecAmounts.push(amount)
      totalEsOpec = totalEsOpec.add(amount)
    }

    if (txn.To.toLowerCase() === vestWithXpcOption.toLowerCase()) {
      vestWithXpcAccounts.push(txn.From)
      vestWithXpcAmounts.push(amount)
      totalEsOpec = totalEsOpec.add(amount)
    }
  }

  console.log("vestWithOpecAccounts", vestWithOpecAccounts.length)
  console.log("vestWithXpcAccounts", vestWithXpcAccounts.length)
  console.log("totalEsOpec", totalEsOpec.toString(), ethers.utils.formatUnits(totalEsOpec, 18))

  if (shouldSendTxns) {
    if (vestWithOpecAccounts.length > 0) {
      await sendTxn(esOpecBatchSender.send(opecVester.address, 4, vestWithOpecAccounts, vestWithOpecAmounts), "esOpecBatchSender.send(opecVester)")
    }
    if (vestWithXpcAccounts.length > 0) {
      await sendTxn(esOpecBatchSender.send(xpcVester.address, 320, vestWithXpcAccounts, vestWithXpcAmounts), "esOpecBatchSender.send(xpcVester)")
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
