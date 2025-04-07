use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}

pub type MintAction {
  Mint
  Burn
}

pub type Extra {
  admin: VerificationKeyHash,
  asset_type: ByteArray,
}

pub type Cip68 {
  metadata: Pairs<ByteArray, Data>,
  version: Int,
  extra: Extra,
}

/// remove the CIP-68 prefix from the asset name
pub fn drop_prefix(asset_name: ByteArray) -> ByteArray {
  bytearray.drop(asset_name, 4)
}

/// find the output with the CIP-68 reference token
pub fn find_ref_nft_output(
  outputs: List<Output>,
  policy_id: PolicyId,
  ref_nft_name: ByteArray,
) -> Output {
  expect Some(ref_nft_output) =
    outputs
      |> list.find(
          fn(output) {
            output.value
              |> assets.tokens(policy_id)
              |> dict.to_pairs()
              |> list.any(
                  fn(pair) {
                    let Pair(asset_name, _amount) = pair
                    asset_name == ref_nft_name
                  },
                )
          },
        )

  ref_nft_output
}

/// ensure metadata is a in a valid format
/// one could add tests here to ensure datum.metadata is valid considering the asset type
pub fn valid_metadata(datum: Cip68) -> Bool {
  when datum.extra.asset_type is {
    // 222 (NFT)
    #"000de140" -> True
    // 333 (FT)
    #"0014df10" -> True
    // 444 (RFT)
    #"001bc280" -> True
    _ -> False
  }
}

// prefixes
// 000de140 --> 222 (NFT)
// 0014df10 --> 333 (FT)
// 001bc280 --> 444 (RFT)
// 000643b0 --> 100 (Reference NFT)

const nft_prefix: ByteArray = #"000de140"
const ft_prefix: ByteArray = #"0014df10"
const rft_prefix: ByteArray = #"001bc280"
const ref_prefix: ByteArray = #"000643b0"

validator sparmint(oneshot: OutputReference) {
  mint(action: MintAction, policy_id: PolicyId, self: Transaction) {
    let Transaction { inputs, mint, outputs, .. } = self

    // get a list of all tokens with this policy id which are minted in this transaction
    let mint_list =
      mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()

    when action is {
      Mint -> {
        // get the reference nft name and amount
        expect Some(Pair(ref_nft_name, reference_nft_amount)) =
          mint_list
            |> list.find(
                fn(pair) {
                  let Pair(asset_name, _amount) = pair
                  asset_name |> bytearray.starts_with(ref_prefix)
                },
              )
        // get the user token name and amount
        expect Some(Pair(user_token_name, user_token_amount)) =
          mint_list
            |> list.find(
                fn(pair) {
                  let Pair(asset_name, _amount) = pair
                  or {
                    asset_name |> bytearray.starts_with(nft_prefix),
                    asset_name |> bytearray.starts_with(ft_prefix),
                    asset_name |> bytearray.starts_with(rft_prefix),
                  }
                },
              )

        // get the output which will hold the ref nft
        let ref_nft_output =
          find_ref_nft_output(outputs, policy_id, ref_nft_name)
        // output with ref nft must be locked in the spend script of this validator which is also the policy id
        expect Script(ref_nft_script) =
          ref_nft_output.address.payment_credential
        // there is a datum on the reference nft output
        expect InlineDatum(ref_nft_datum) = ref_nft_output.datum
        // the datum is of type Cip68
        expect ref_metadata: Cip68 = ref_nft_datum

        and {
          // only ada and the reference NFT are allowed on the ref nft output
          1 == (ref_nft_output.value
            |> assets.without_lovelace()
            |> assets.flatten()
            |> list.length()),

          // the spend script of the ref nft must be the one specified in this validator (meaning it matches the policy id)
          ref_nft_script == policy_id,
          // user token amount must be positive or EXACTLY 1 if the token is an NFT
          // if have nft prefix there better be exactly 1 user token
          if user_token_name |> bytearray.starts_with(nft_prefix) {
            1 == user_token_amount
          } else {
            user_token_amount > 0
          },
          // there must be exactly one reference nft
          1 == reference_nft_amount,
          // we mint exactly 2 types of tokens on this policy
          2 == list.length(mint_list),
          // oneshot utxo must be present in the inputs
          list.any(inputs, fn(input) { input.output_reference == oneshot }),
          // without prefix the reference nft name and user token name are the same
          drop_prefix(ref_nft_name) == drop_prefix(user_token_name),
          // the user token CIP-68 prefix must equal metadata.extra.asset_type
          user_token_name |> bytearray.starts_with(ref_metadata.extra.asset_type),
          // metadata is valid considering the token type
          valid_metadata(ref_metadata),
        }
      }
      Burn -> {
        // get asset name and the amount we are burning  
        expect [Pair(asset_name, amount)] = mint_list

        and {
          // must only burn one type of token
          1 == list.length(mint_list),
          // amount minted must be negative
          amount < 0,
          // must be one of the CIP-68 token prefixes other than the ref nft prefix
          or {
            asset_name |> bytearray.starts_with(nft_prefix),
            asset_name |> bytearray.starts_with(ft_prefix),
            asset_name |> bytearray.starts_with(rft_prefix),
          },
        }
      }
    }
  }

  spend(
    datum: Option<Cip68>,
    _redeemer: Data,
    focus_input_ref: OutputReference,
    self: Transaction,
  ) {
    // get previous metadata from the datum
    expect Some(prev_metadata) = datum

    // find the focus input given its output reference
    expect Some(focus_input) = list.find(self.inputs, fn(input) { input.output_reference == focus_input_ref })
    // get the policy id from the focus input
    expect Script(policy_id) = focus_input.output.address.payment_credential

    // get all tokens with this policy id which are present on the focous input
    let policy_tokens = focus_input.output.value
        |> assets.tokens(policy_id)
        |> dict.to_pairs()

    // find reference NFT name
    expect Some(Pair(ref_nft_name, _)) = list.head(policy_tokens)

    // find the reference nft output given its name and policy id
    let ref_nft_output = find_ref_nft_output(self.outputs, policy_id, ref_nft_name)

    // there must be an inline datum on the reference nft output to hold the metadata
    expect InlineDatum(new_ref_nft_datum) = ref_nft_output.datum
    // the new datum must be of type Cip68
    expect new_metadata: Cip68 = new_ref_nft_datum

    and {
      // admin must have signed the transaction
      list.has(self.extra_signatories, prev_metadata.extra.admin),
      // token must remain on same address
      ref_nft_output.address == focus_input.output.address,
      // there must be no user tokens present on the input with the ref token 
      1 == list.length(policy_tokens),
      // the reference token name must have the expected prefix
      ref_nft_name |> bytearray.starts_with(ref_prefix),
      // asset type must not change
      prev_metadata.extra.asset_type == new_metadata.extra.asset_type,
      // metadata is valid considering the token type
      valid_metadata(new_metadata),
    }
  }

  else(_) {
    fail
  }
}
