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
  toLabel,
  toUnit,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";
import blueprint from "./plutus.json" with { type: "json" };
import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";

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

const bob = generateEmulatorAccount({
  lovelace: 200n * 1_000_000n,
});

const emulator = new Emulator([alice, bob]);
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

const label = 333;
const assetName = fromText(tokenName);
const refUnit = toUnit(policyId, assetName, 100);
const userUnit = toUnit(policyId, assetName, label);

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
  const extra = new Constr(0, [
    paymentCredentialOf(alice.address).hash,
    toLabel(label),
  ]);
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

Deno.test("Metadata Update", async () => {
  const refUtxo = await lucid.utxoByUnit(refUnit);
  const initialMetadata = await lucid.datumOf(refUtxo);

  const metadata2 = Data.fromJson({
    name: tokenName,
    description: "Updated description",
    image: "https://example.com/updated-image.jpg",
  });
  const version = 1n;
  const extra = new Constr(0, [
    paymentCredentialOf(alice.address).hash,
    toLabel(label),
  ]);
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

Deno.test("Metadata Update without Admin", async () => {
  const refUtxo = await lucid.utxoByUnit(refUnit);

  const metadata2 = Data.fromJson({
    name: tokenName,
    description: "Updated description",
    image: "https://example.com/updated-image.jpg",
  });
  const version = 1n;
  const extra = new Constr(0, [
    paymentCredentialOf(alice.address).hash,
    toLabel(label),
  ]);
  const cip68_2 = new Constr(0, [metadata2, version, extra]);
  const datum2 = Data.to(cip68_2);

  const tx = lucid
    .newTx()
    .collectFrom([refUtxo], Data.void())
    .attach.SpendingValidator(validator)
    .pay.ToContract(
      validatorToAddress(
        "Preview",
        validator,
        getAddressDetails(alice.address).stakeCredential,
      ),
      { kind: "inline", value: datum2 },
      { [refUnit]: 1n },
    );
  // .addSigner(alice.address);

  await assertRejects(
    () => tx.complete(),
    "Transaction should fail because the admin signature is required by the spending validator",
  );

  await assertRejects(
    () => tx.addSigner(bob.address).complete(),
    "Transaction should fail because, though we've added a signer we have not added the admin signer",
  );

  await tx.addSigner(alice.address).complete();
});

Deno.test("May not spend Ref Nft to Another Address", async () => {
  const refUtxo = await lucid.utxoByUnit(refUnit);

  const metadata2 = Data.fromJson({
    name: tokenName,
    description: "Updated description",
    image: "https://example.com/updated-image.jpg",
  });
  const version = 1n;
  const extra = new Constr(0, [paymentCredentialOf(alice.address).hash]);
  const cip68_2 = new Constr(0, [metadata2, version, extra]);
  const datum2 = Data.to(cip68_2);

  const tx = lucid
    .newTx()
    .collectFrom([refUtxo], Data.void())
    .attach.SpendingValidator(validator)
    .pay.ToContract(
      bob.address,
      {
        kind: "inline",
        value: datum2,
      },
      {
        [refUnit]: 1n,
      },
    )
    .addSigner(alice.address);

  await assertRejects(
    () => tx.complete(),
    "Transaction should fail because the ref nft cannot be spent to another address",
  );
});

Deno.test("May not change prefix", async () => {
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
  const refUnit = toUnit(policyId, assetName, 100);
  const userUnit = toUnit(policyId, assetName, 223); /// 222 + 1 this violates the minting policy
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
  const extra = new Constr(0, [paymentCredentialOf(alice.address).hash]);
  const cip68 = new Constr(0, [metadata, version, extra]);
  const datum = Data.to(cip68);

  const tx = lucid
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
    });
  // .complete();

  await assertRejects(
    () => tx.complete(),
    "Transaction should fail because the user token cannot be minted with a different prefix",
  );
});

Deno.test("Only one reference token", async () => {
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
  const refUnit = toUnit(policyId, assetName, 100);
  const userUnit = toUnit(policyId, assetName, 222);
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
  const extra = new Constr(0, [paymentCredentialOf(alice.address).hash]);
  const cip68 = new Constr(0, [metadata, version, extra]);
  const datum = Data.to(cip68);

  const tx = lucid
    .newTx()
    .collectFrom([utxo])
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets(
      {
        [refUnit]: 2n,
        [userUnit]: 1_000n,
      },
      MintAction.Mint,
    )
    .pay.ToContract(lockAddress, {
      kind: "inline",
      value: datum,
    }, {
      [refUnit]: 2n,
    });

  await assertRejects(
    () => tx.complete(),
    "Transaction should fail becauise we may only mint one reference token",
  );
});

Deno.test("Mint amount must be negative when burning", async () => {
  const validator: SpendingValidator = {
    type: "PlutusV3",
    script: parameterizedValidator,
  };

  const mintingPolicy: MintingPolicy = validator as MintingPolicy;
  const burnAmount = 3n;

  const tx = lucid
    .newTx()
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets({
      [userUnit]: burnAmount, // removed the negative sign here which violates the minting (burning) policy
    }, MintAction.Burn);

  await assertRejects(
    () => tx.complete(),
    "Transaction should fail because the mint amount must be negative when burning",
  );
});

Deno.test("Asset type in cip68.extra.asset_type must not change", async () => {
  const refUtxo = await lucid.utxoByUnit(refUnit);

  const metadata2 = Data.fromJson({
    name: tokenName,
    description: "Updated description",
    image: "https://example.com/updated-image.jpg",
  });
  const version = 1n;
  const extra = new Constr(0, [
    paymentCredentialOf(alice.address).hash,
    toLabel(444), // this has changed and thus will violate the spending validator
  ]);
  const cip68_2 = new Constr(0, [metadata2, version, extra]);
  const datum2 = Data.to(cip68_2);

  const tx = lucid
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
    .addSigner(alice.address);

  await assertRejects(
    () => tx.complete(),
    "Transaction should fail because the asset type in cip68.extra.asset_type has changed",
  );
});

Deno.test("Any owner can burn", async () => {
  // send 50 tokens to bob
  {
    const tx = await lucid
      .newTx()
      .pay.ToAddress(bob.address, {
        [userUnit]: 50n,
      })
      .complete();

    const txSigned = await tx.sign.withWallet().complete();
    await txSigned.submit();
    emulator.awaitBlock(1);

    const bobMentholUtxos = await lucid.utxosAtWithUnit(bob.address, userUnit);
    assert(bobMentholUtxos.length > 0, "Bob should have menthol tokens");
  }

  // burn 50 tokens
  {
    lucid.selectWallet.fromSeed(bob.seedPhrase);
    const tx = await lucid
      .newTx()
      .attach.MintingPolicy(mintingPolicy)
      .mintAssets({
        [userUnit]: -50n,
      }, MintAction.Burn)
      .complete();

    const txSigned = await tx.sign.withWallet().complete();
    await txSigned.submit();
    emulator.awaitBlock(1);

    const bobMentholUtxos = await lucid.utxosAtWithUnit(bob.address, userUnit);
    assert(bobMentholUtxos.length === 0, "Bob should have no menthol tokens");
  }

  lucid.selectWallet.fromSeed(alice.seedPhrase); // change back to alice
});

Deno.test("Can mint NFTs", async () => {
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

  const label = 222;
  const tokenName = "Mentha";
  const assetName = fromText(tokenName);
  const refUnit = toUnit(policyId, assetName, 100);
  const userUnit = toUnit(policyId, assetName, label);

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
  const extra = new Constr(0, [
    paymentCredentialOf(alice.address).hash,
    toLabel(label),
  ]);
  const cip68 = new Constr(0, [metadata, version, extra]);
  const datum = Data.to(cip68);

  const MintAction = {
    Mint: Data.to(new Constr(0, [])),
    Burn: Data.to(new Constr(1, [])),
  };

  /// minting more than one token with the nft prefix is not allowed
  await assertRejects(
    () =>
      lucid
        .newTx()
        .collectFrom([utxo])
        .attach.MintingPolicy(mintingPolicy)
        .mintAssets(
          {
            [refUnit]: 1n,
            [userUnit]: 2n, // too many user tokens
          },
          MintAction.Mint,
        )
        .pay.ToContract(lockAddress, {
          kind: "inline",
          value: datum,
        }, {
          [refUnit]: 1n,
        })
        .complete(),
    "Transaction should fail because minting more than one token with the nft prefix is not allowed",
  );

  const tx = await lucid
    .newTx()
    .collectFrom([utxo])
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets(
      {
        [refUnit]: 1n,
        [userUnit]: 1n,
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
    1n,
    "User should have 1000 tokens",
  );
});

Deno.test("User token and reference token must be minted together", async () => {
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

  const label = 222;
  const tokenName = "Mentha";
  const assetName = fromText(tokenName);
  const refUnit = toUnit(policyId, assetName, 100);
  const userUnit = toUnit(policyId, assetName, label);

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
  const extra = new Constr(0, [
    paymentCredentialOf(alice.address).hash,
    toLabel(label),
  ]);
  const cip68 = new Constr(0, [metadata, version, extra]);
  const datum = Data.to(cip68);

  const MintAction = {
    Mint: Data.to(new Constr(0, [])),
    Burn: Data.to(new Constr(1, [])),
  };

  await assertRejects(
    () =>
      lucid
        .newTx()
        .collectFrom([utxo])
        .attach.MintingPolicy(mintingPolicy)
        .mintAssets(
          {
            [refUnit]: 1n,
            [userUnit]: 1n,
          },
          MintAction.Mint,
        )
        .complete(),
    "Transaction should fail because the reference token must be sent to the spend script",
  );

  await assertRejects(
    () =>
      lucid
        .newTx()
        .collectFrom([utxo])
        .attach.MintingPolicy(mintingPolicy)
        .mintAssets(
          {
            [refUnit]: 1n,
          },
          MintAction.Mint,
        )
        .pay.ToContract(lockAddress, {
          kind: "inline",
          value: datum,
        }, {
          [refUnit]: 1n,
        })
        .complete(),
    "Transaction should fail because the user token must be minted",
  );

  await assertRejects(
    () =>
      lucid
        .newTx()
        .collectFrom([utxo])
        .attach.MintingPolicy(mintingPolicy)
        .mintAssets(
          {
            [userUnit]: 1n,
          },
          MintAction.Mint,
        )
        .complete(),
    "Transaction should fail because the reference token must be minted",
  );
});
