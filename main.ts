import {
  applyParamsToScript,
  Constr,
  Data,
  Emulator,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  MintingPolicy,
  mintingPolicyToId,
  SpendingValidator,
  toUnit,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";
import blueprint from "./plutus.json" with { type: "json" };

const alice = generateEmulatorAccount({
  lovelace: 200n * 1_000_000n,
});

const emulator = new Emulator([alice]);

const lucid = await Lucid(emulator, "Preview");
lucid.selectWallet.fromSeed(alice.seedPhrase);

// pick a utxo from alice
const utxo = (await lucid.utxosAt(alice.address))[0];
const utxoRefParam = new Constr(0, [
  new Constr(0, [utxo.txHash]),
  BigInt(utxo.outputIndex),
]);

const rawValidator =
  blueprint.validators.find((v) => v.title === "sparmint.sparmint.spend")!
    .compiledCode;
const parameterizedValidator = applyParamsToScript(
  rawValidator,
  [utxoRefParam],
);

const validator: SpendingValidator = {
  type: "PlutusV3",
  script: parameterizedValidator,
};

const mintingPolicy: MintingPolicy = validator as MintingPolicy;

const policyId = mintingPolicyToId(mintingPolicy);
console.log(`Policy ID:\t${policyId}`);

const lockAddress = validatorToAddress(
  "Preview",
  validator,
  getAddressDetails(alice.address).stakeCredential,
);
console.log(`Lock Address:\t${lockAddress}`);

const tokenName = "Menthol";
const assetName = fromText(tokenName);

const refUnit = toUnit(policyId, assetName, 100);
const userUnit = toUnit(policyId, assetName, 222);

console.log(`Ref Unit:\t${refUnit}`);
console.log(`User Unit:\t${userUnit}`);

const metadata = Data.fromJson({
  name: tokenName,
  description:
    "Spearmint (Mentha spicata), also known as garden mint, common mint, lamb mint and mackerel mint,[5][6] is native to Europe and southern temperate Asia, extending from Ireland in the west to southern China in the east.",
  image:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Minze.jpg/1280px-Minze.jpg",
});
const version = 1n;
const extra: Data[] = [];
const cip68 = new Constr(0, [metadata, version, extra]);
const datum = Data.to(cip68);

const MintAction = {
  Mint: Data.to(new Constr(0, [])),
  Burn: Data.to(new Constr(1, [])),
};

const tx = await lucid
  .newTx()
  .collectFrom([utxo])
  .mintAssets(
    {
      [refUnit]: 1n,
      [userUnit]: 1_000n,
    },
    MintAction.Mint,
  )
  .attach.MintingPolicy(mintingPolicy)
  .pay.ToContract(lockAddress, {
    kind: "inline",
    value: datum,
  }, {
    [refUnit]: 1n,
  })
  .complete();

console.log(tx);

// must mint reference NFT with user tokens

// cannot burn reference NFT

// cannot mint more than 1 reference NFT

// reference token can only be sent to the address it already exists on
