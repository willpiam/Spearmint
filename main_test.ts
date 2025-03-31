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
  paymentCredentialOf,
  SpendingValidator,
  toUnit,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";
import blueprint from "./plutus.json" with { type: "json" };
import { assert, assertEquals, assertExists } from "@std/assert";

/*

  run these tests:

    deno test --allow-read

*/

const MintAction = {
  Mint: Data.to(new Constr(0, [])),
  Burn: Data.to(new Constr(1, [])),
};

const alice = generateEmulatorAccount({
  lovelace: 200n * 1_000_000n,
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Preview");
lucid.selectWallet.fromSeed(alice.seedPhrase);

// Helper function to get balance
const balanceOf = async (address: string, asset: string = "lovelace") =>
  await lucid.utxosAt(address).then((utxos: any[]) =>
    utxos.reduce((acc, utxo) => acc + (utxo.assets[asset] ?? 0n), 0n)
  );

const utxo = (await lucid.utxosAt(alice.address))[0];
const utxoRefParam = new Constr(0, [
  utxo.txHash,
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
const tokenName = "Menthol";

const assetName = fromText(tokenName);
const refUnit = toUnit(policyId, assetName, 100);
const userUnit = toUnit(policyId, assetName, 222);

// Test initial minting
Deno.test("Initial Minting", async () => {
  const utxo = (await lucid.utxosAt(alice.address))[0];

  const lockAddress = validatorToAddress(
    "Preview",
    validator,
    getAddressDetails(alice.address).stakeCredential,
  );

  const metadata = Data.fromJson({
    name: tokenName,
    description: "Test description",
    image: "https://example.com/image.jpg",
  });
  const version = 1n;
  // const extra: Data[] = [];
  const extra = new Constr(0, [paymentCredentialOf(alice.address).hash]);
  const cip68 = new Constr(0, [metadata, version, extra]);
  const datum = Data.to(cip68);

  const MintAction = {
    Mint: Data.to(new Constr(0, [])),
    Burn: Data.to(new Constr(1, [])),
  };

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

  assertExists(txHash, "Transaction hash should be created");
  assertEquals(
    await balanceOf(alice.address, userUnit),
    1_000n,
    "User should have 1000 tokens",
  );
});

// Test burning
Deno.test("Token Burning", async () => {
  const validator: SpendingValidator = {
    type: "PlutusV3",
    script: parameterizedValidator,
  };

  const mintingPolicy: MintingPolicy = validator as MintingPolicy;

  const initialBalance = await balanceOf(alice.address, userUnit);
  const burnAmount = 3n;

  const tx = await lucid
    .newTx()
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets({
      [userUnit]: -burnAmount,
    }, MintAction.Burn)
    .complete();

  const txSigned = await tx.sign.withWallet().complete();
  const txHash = await txSigned.submit();
  emulator.awaitBlock(1);

  assertExists(txHash, "Transaction hash should be created");
  assertEquals(
    await balanceOf(alice.address, userUnit),
    initialBalance - burnAmount,
    "Balance should be reduced by burn amount",
  );
});

// Test metadata update
Deno.test("Metadata Update", async () => {
  const refUtxo = await lucid.utxoByUnit(refUnit);
  const initialMetadata = await lucid.datumOf(refUtxo);

  const metadata2 = Data.fromJson({
    name: tokenName,
    description: "Updated description",
    image: "https://example.com/updated-image.jpg",
  });
  const version = 1n;
  const extra = new Constr(0, [paymentCredentialOf(alice.address).hash]);
  const cip68_2 = new Constr(0, [metadata2, version, extra]);
  const datum2 = Data.to(cip68_2);

  const tx = await lucid
    .newTx()
    .collectFrom([refUtxo], Data.void())
    .attach.SpendingValidator(validator)
    .pay.ToContract(
      validatorToAddress(
        "Preview",
        validator,
        getAddressDetails(alice.address).stakeCredential,
      ),
      {
        kind: "inline",
        value: datum2,
      },
      {
        [refUnit]: 1n,
      },
    )
    .addSigner(alice.address)
    .complete();

  const txSigned = await tx.sign.withWallet().complete();
  const txHash = await txSigned.submit();
  emulator.awaitBlock(1);

  assertExists(txHash, "Transaction hash should be created");

  const refUtxo2 = await lucid.utxoByUnit(refUnit);
  const updatedMetadata = await lucid.datumOf(refUtxo2);

  assert(updatedMetadata !== initialMetadata, "Metadata should be updated");
});
