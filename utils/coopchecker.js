import axios from 'axios';
import protobuf from 'protobufjs';

const PROTO_PATH = 'ei.proto';
const STATUS_ENDPOINT = 'https://www.auxbrain.com/ei/coop_status';
const DEFAULT_USER_ID = process.env.EID;
const REQUEST_TIMEOUT_MS = 80_000;
const COOP_CODES = Object.freeze([
  ...Array.from({ length: 26 }, (_, index) => `${String.fromCodePoint(97 + index)}oo`),
  '-oo',
]);

let cachedProto = null;

async function loadProtoTypes() {
  if (cachedProto) return cachedProto;
  const root = await protobuf.load(PROTO_PATH);
  cachedProto = {
    ContractCoopStatusRequest: root.lookupType('ei.ContractCoopStatusRequest'),
    AuthenticatedMessage: root.lookupType('ei.AuthenticatedMessage'),
    ContractCoopStatusResponse: root.lookupType('ei.ContractCoopStatusResponse'),
  };
  return cachedProto;
}

async function postCoopStatus(contractIdentifier, coopCode) {
  const { ContractCoopStatusRequest, AuthenticatedMessage, ContractCoopStatusResponse } = await loadProtoTypes();

  const payload = ContractCoopStatusRequest.create({
    contractIdentifier,
    coopIdentifier: coopCode,
    userId: DEFAULT_USER_ID,
  });

  const errMsg = ContractCoopStatusRequest.verify(payload);
  if (errMsg) {
    throw new Error(`Payload verify failed: ${errMsg}`);
  }

  const requestBuffer = ContractCoopStatusRequest.encode(payload).finish();
  const requestBase64 = Buffer.from(requestBuffer).toString('base64');

  const response = await axios.post(
    STATUS_ENDPOINT,
    { data: requestBase64 },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'text',
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  const responseBuffer = Buffer.from(response.data, 'base64');
  const authenticated = AuthenticatedMessage.decode(responseBuffer);
  return ContractCoopStatusResponse.decode(authenticated.message);
}

export async function checkCoop(contractIdentifier, coopCode) {
  try {
    const status = await postCoopStatus(contractIdentifier, coopCode);
    const isCreated = Object.hasOwn(status, 'totalAmount');
    return { coopCode, free: !isCreated };
  } catch (err) {
    return { coopCode, error: err?.message ?? String(err) };
  }
}

export async function checkAllFromContractID(contractIdentifier, coopCodes) {
  const codesToCheck = Array.isArray(coopCodes) && coopCodes.length > 0 ? coopCodes : COOP_CODES;
  const checks = codesToCheck.map(code => checkCoop(contractIdentifier, code));
  const results = await Promise.all(checks);

  const filteredResults = results
    .filter(result => !result.error && result.free)
    .map(result => result.coopCode);

  return { filteredResults, coopCodes: [...codesToCheck] };
}

export async function fetchCoopContributors(contractIdentifier, coopCode) {
  try {
    const status = await postCoopStatus(contractIdentifier, coopCode);
    const contributors = Array.isArray(status?.contributors) ? status.contributors : [];
    return contributors;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    error.contractIdentifier = contractIdentifier;
    error.coopCode = coopCode;
    throw error;
  }
}
