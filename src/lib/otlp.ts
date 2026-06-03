// Minimal OTLP/HTTP logs decoder for Cowork's push payload.
// Cowork sends `application/x-protobuf` encoded ExportLogsServiceRequest.
// We define just enough of the OTLP proto to extract log records and
// their attributes.
import protobuf from "protobufjs";

const PROTO = `
syntax = "proto3";
package otlp;

message ExportLogsServiceRequest {
  repeated ResourceLogs resource_logs = 1;
}
message ResourceLogs {
  Resource resource = 1;
  repeated ScopeLogs scope_logs = 2;
}
message ScopeLogs {
  repeated LogRecord log_records = 2;
}
message LogRecord {
  fixed64 time_unix_nano = 1;
  fixed64 observed_time_unix_nano = 11;
  int32 severity_number = 2;
  string severity_text = 3;
  AnyValue body = 5;
  repeated KeyValue attributes = 6;
}
message KeyValue {
  string key = 1;
  AnyValue value = 2;
}
message AnyValue {
  oneof value {
    string string_value = 1;
    bool bool_value = 2;
    int64 int_value = 3;
    double double_value = 4;
    ArrayValue array_value = 5;
    KeyValueList kvlist_value = 6;
    bytes bytes_value = 7;
  }
}
message ArrayValue {
  repeated AnyValue values = 1;
}
message KeyValueList {
  repeated KeyValue values = 1;
}
message Resource {
  repeated KeyValue attributes = 1;
}
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const ExportLogsServiceRequest = root.lookupType(
  "otlp.ExportLogsServiceRequest"
);

type AnyValue =
  | { string_value?: string; bool_value?: boolean; int_value?: number | bigint; double_value?: number; bytes_value?: Uint8Array }
  | undefined;

function anyValueToPrimitive(v: AnyValue): unknown {
  if (v == null) return null;
  if ("string_value" in v && v.string_value !== undefined) return v.string_value;
  if ("bool_value" in v && v.bool_value !== undefined) return v.bool_value;
  if ("int_value" in v && v.int_value !== undefined) {
    return typeof v.int_value === "bigint" ? Number(v.int_value) : v.int_value;
  }
  if ("double_value" in v && v.double_value !== undefined) return v.double_value;
  return null;
}

export type LogRecordOut = {
  occurredAt: Date;
  body: string | null;
  attributes: Record<string, unknown>;
  resourceAttributes: Record<string, unknown>;
};

export function decodeOtlpLogs(bytes: Uint8Array): LogRecordOut[] {
  const msg = ExportLogsServiceRequest.decode(bytes);
  const obj = ExportLogsServiceRequest.toObject(msg, {
    longs: Number,
    enums: Number,
    bytes: Array,
    defaults: false,
  }) as {
    resource_logs?: Array<{
      resource?: { attributes?: Array<{ key: string; value: AnyValue }> };
      scope_logs?: Array<{
        log_records?: Array<{
          time_unix_nano?: number;
          observed_time_unix_nano?: number;
          body?: AnyValue;
          attributes?: Array<{ key: string; value: AnyValue }>;
        }>;
      }>;
    }>;
  };

  const out: LogRecordOut[] = [];
  for (const rl of obj.resource_logs ?? []) {
    const resourceAttrs: Record<string, unknown> = {};
    for (const kv of rl.resource?.attributes ?? []) {
      resourceAttrs[kv.key] = anyValueToPrimitive(kv.value);
    }
    for (const sl of rl.scope_logs ?? []) {
      for (const lr of sl.log_records ?? []) {
        const attrs: Record<string, unknown> = {};
        for (const kv of lr.attributes ?? []) {
          attrs[kv.key] = anyValueToPrimitive(kv.value);
        }
        const ts =
          lr.time_unix_nano && lr.time_unix_nano > 0
            ? lr.time_unix_nano
            : (lr.observed_time_unix_nano ?? Date.now() * 1_000_000);
        const occurredAt = new Date(Math.round(ts / 1_000_000));
        const body = lr.body ? (anyValueToPrimitive(lr.body) as string | null) : null;
        out.push({
          occurredAt,
          body: body == null ? null : String(body),
          attributes: attrs,
          resourceAttributes: resourceAttrs,
        });
      }
    }
  }
  return out;
}
