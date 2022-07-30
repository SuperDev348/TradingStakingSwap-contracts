const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const signer = await getFrameSigner()

  const esOpec = await contractAt("EsOpec", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const esOpecGov = await contractAt("Timelock", await esOpec.gov(), signer)
  const opecVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const opecVesterGov = await contractAt("Timelock", await opecVester.gov(), signer)
  const xpcVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")
  const xpcVesterGov = await contractAt("Timelock", await xpcVester.gov(), signer)

  return { esOpec, esOpecGov, opecVester, opecVesterGov, xpcVester, xpcVesterGov }
}

async function getAvaxValues() {
  const signer = await getFrameSigner()

  const esOpec = await contractAt("EsOpec", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const esOpecGov = await contractAt("Timelock", await esOpec.gov(), signer)
  const opecVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")
  const opecVesterGov = await contractAt("Timelock", await opecVester.gov(), signer)
  const xpcVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A")
  const xpcVesterGov = await contractAt("Timelock", await xpcVester.gov(), signer)

  return { esOpec, esOpecGov, opecVester, opecVesterGov, xpcVester, xpcVesterGov }
}

async function main() {
  const method = network === "arbitrum" ? getArbValues : getAvaxValues
  const { esOpec, esOpecGov, opecVester, opecVesterGov, xpcVester, xpcVesterGov } = await method()

  const esOpecBatchSender = await deployContract("EsOpecBatchSender", [esOpec.address])

  console.log("esOpec", esOpec.address)
  console.log("esOpecGov", esOpecGov.address)
  console.log("opecVester", opecVester.address)
  console.log("opecVesterGov", opecVesterGov.address)
  console.log("xpcVester", xpcVester.address)
  console.log("xpcVesterGov", xpcVesterGov.address)

  await sendTxn(esOpecGov.signalSetHandler(esOpec.address, esOpecBatchSender.address, true), "esOpecGov.signalSetHandler")
  await sendTxn(opecVesterGov.signalSetHandler(opecVester.address, esOpecBatchSender.address, true), "opecVesterGov.signalSetHandler")
  await sendTxn(xpcVesterGov.signalSetHandler(xpcVester.address, esOpecBatchSender.address, true), "xpcVesterGov.signalSetHandler")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
