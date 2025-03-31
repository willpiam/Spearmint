import { assertEquals } from "@std/assert";
import { add } from "./main.ts";

Deno.test(function addTest() {
  assertEquals(add(2, 3), 5);
});

// must mint reference NFT with user tokens

// cannot burn reference NFT

// cannot mint more than 1 reference NFT

// reference token can only be sent to the address it already exists on
