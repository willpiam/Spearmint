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

// FOR NOW WE WILL ONLY DO THINGS WE EXPECT TO SUCCEED
// LATER WE WILL CHECK TO ENSURE IT FAILS WHEN IT SHOULD

const alice = generateEmulatorAccount({
  lovelace: 200n * 1_000_000n,
});

const emulator = new Emulator([alice]);

const lucid = await Lucid(emulator, "Preview");
lucid.selectWallet.fromSeed(alice.seedPhrase);

// pick a utxo from alice
const utxo = (await lucid.utxosAt(alice.address))[0];
const utxoRefParam = new Constr(0, [
  utxo.txHash,
  BigInt(utxo.outputIndex),
]);
console.log(`utxo tx hash:\t\t${utxo.txHash}`);
console.log(`utxo index:\t\t${utxo.outputIndex}`);

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
console.log(`Policy ID:\t\t${policyId}`);

const lockAddress = validatorToAddress(
  "Preview",
  validator,
  getAddressDetails(alice.address).stakeCredential,
);
console.log(`Lock Address:\t\t${lockAddress}`);

const tokenName = "Menthol";
const assetName = fromText(tokenName);

const refUnit = toUnit(policyId, assetName, 100);
const userUnit = toUnit(policyId, assetName, 222);

console.log(`Ref Unit:\t\t${refUnit}`);
console.log(`User Unit:\t\t${userUnit}`);

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

{
  const tx = await lucid
    .newTx()
    .collectFrom([utxo])
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets(
      {
        [refUnit]: 1n,
        [userUnit]: 1_000n,
      },
      MintAction.Mint,
    )
    .pay.ToContract(lockAddress, {
      kind: "inline",
      value: datum,
    }, {
      [refUnit]: 1n,
    })
    .complete();

  const txSigned = await tx.sign.withWallet().complete();
  const txHash = await txSigned.submit();
  emulator.awaitBlock(1);
  console.log(`tx hash:\t\t${txHash}`);
}

console.log(`\n`);

// BURN
const balanceOf = async (address: string, asset: string = "lovelace") =>
  await lucid.utxosAt(address).then((utxos) =>
    utxos.reduce((acc, utxo) => acc + utxo.assets[asset], 0n)
  );

console.log(`Alice balance:\t\t${await balanceOf(alice.address, userUnit)}`);
// console.log(`Alice balance:\t${parseInt(aliceBalance.toString()) / 1_000_000}`);

{
  const tx = await lucid
    .newTx()
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets({
      [userUnit]: -3n,
    }, MintAction.Burn)
    .complete();

  const txSigned = await tx.sign.withWallet().complete();
  const txHash = await txSigned.submit();
  emulator.awaitBlock(1);
  console.log(`tx hash:\t\t${txHash}`);
}

console.log(`Alice balance:\t\t${await balanceOf(alice.address, userUnit)}`);

console.log(`\n`);
// GET METADATA
const refUtxo = await lucid.utxoByUnit(refUnit);
const rawMetadata1 = await lucid.datumOf(refUtxo);
// console.log(`Raw Metadata:\t${rawMetadata}`);

// UPDATE METADATA

const metadata2 = Data.fromJson({
  name: tokenName,
  description:
    "Spearmint (Mentha spicata), also known as garden mint, common mint, lamb mint and mackerel mint,[5][6] is native to Europe and southern temperate Asia, extending from Ireland in the west to southern China in the east.",
  image:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Spearmint_in_Bangladesh_03.jpg/1280px-Spearmint_in_Bangladesh_03.jpg",
});
const cip68_2 = new Constr(0, [metadata2, version, extra]);
const datum2 = Data.to(cip68_2);

{
  const tx = await lucid
    .newTx()
    .collectFrom([refUtxo], Data.void())
    .attach.SpendingValidator(validator)
    .pay.ToContract(lockAddress, {
      kind: "inline",
      value: datum2,
    }, {
      [refUnit]: 1n,
    })
    .complete();

  const txSigned = await tx.sign.withWallet().complete();
  const txHash = await txSigned.submit();
  emulator.awaitBlock(1);
  console.log(`tx hash:\t\t${txHash}`);
}

const refUtxo2 = await lucid.utxoByUnit(refUnit);
console.log(`Ref utxo changed:\t${refUtxo2 !== refUtxo}`);
const rawMetadata2 = await lucid.datumOf(refUtxo);
console.log(`Raw Metadata changed:\t${rawMetadata2 !== rawMetadata1}`);
