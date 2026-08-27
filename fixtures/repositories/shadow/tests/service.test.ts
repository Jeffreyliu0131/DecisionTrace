import { auditedMessage } from "../src/service.js";

if (auditedMessage("hello") !== "audited:hello") {
  throw new Error("Synthetic fixture assertion failed");
}
