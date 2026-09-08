//! Target-scoped compatibility for Codex function declarations.
//!
//! Function calls carry object arguments. Intersecting same-instance union
//! branches with that root constraint preserves the set of valid object calls.
//! Never walk into properties/items/$defs: those describe different instances.

use crate::proxy::error::ProxyError;
use serde_json::{json, Value};

const MAX_SCHEMA_DEPTH: usize = 48;
const MAX_SCHEMA_NODES: usize = 4096;

fn target(model: &str, prefix: &str) -> bool {
    model
        .rsplit('/')
        .next()
        .unwrap_or(model)
        .to_ascii_lowercase()
        .starts_with(prefix)
}

pub(crate) fn is_grok_model(model: &str) -> bool {
    target(model, "grok-")
}

/// Only modifies declaration metadata and root-instance schemas. Input history,
/// function names, tool choice, arguments and nested user properties are untouched.
pub(crate) fn adapt_chat_tools(body: &mut Value) -> Result<(), ProxyError> {
    let model = body.get("model").and_then(Value::as_str).unwrap_or("");
    let gemini = target(model, "gemini-");
    let grok = target(model, "grok-");
    if !gemini && !grok {
        return Ok(());
    }
    let Some(tools) = body.get("tools").and_then(Value::as_array) else {
        return Ok(());
    };
    let mut adapted = tools.clone();
    for tool in &mut adapted {
        if tool.get("type").and_then(Value::as_str) != Some("function") {
            continue;
        }
        let Some(function) = tool.get_mut("function").and_then(Value::as_object_mut) else {
            continue;
        };
        if gemini {
            // New API may reuse the Chat declaration as a native Gemini function.
            // strict is Chat metadata, not a Gemini FunctionDeclaration field.
            function.remove("strict");
        }
        if grok {
            let Some(schema) = function.get_mut("parameters") else {
                continue;
            };
            let mut reference_budget = MAX_SCHEMA_NODES;
            check_schema_references(schema, 0, &mut reference_budget)?;
            let mut budget = MAX_SCHEMA_NODES;
            if !constrain_object(schema, 0, &mut budget)? {
                return Err(schema_error("工具根参数不允许对象，无法安全适配 Grok"));
            }
        }
    }
    body["tools"] = Value::Array(adapted);
    Ok(())
}

fn check_schema_references(
    value: &Value,
    depth: usize,
    budget: &mut usize,
) -> Result<(), ProxyError> {
    if depth > MAX_SCHEMA_DEPTH || *budget == 0 {
        return Err(schema_error("工具结构过深或过大，请简化工具定义"));
    }
    *budget -= 1;
    match value {
        Value::Object(map) => {
            for key in ["$ref", "$dynamicRef", "$recursiveRef"] {
                if let Some(reference) = map.get(key) {
                    let allowed = key == "$ref"
                        && reference.as_str().is_some_and(|r| {
                            r.starts_with("#/$defs/") || r.starts_with("#/definitions/")
                        });
                    if !allowed {
                        return Err(schema_error("含无法安全适配的根引用或外部引用"));
                    }
                }
            }
            for key in [
                "properties",
                "patternProperties",
                "$defs",
                "definitions",
                "dependentSchemas",
            ] {
                if let Some(children) = map.get(key).and_then(Value::as_object) {
                    for child in children.values() {
                        check_schema_references(child, depth + 1, budget)?;
                    }
                }
            }
            for key in [
                "anyOf",
                "oneOf",
                "allOf",
                "items",
                "prefixItems",
                "additionalProperties",
                "unevaluatedProperties",
                "unevaluatedItems",
                "not",
                "if",
                "then",
                "else",
                "contains",
                "propertyNames",
            ] {
                if let Some(child) = map.get(key) {
                    check_schema_references(child, depth + 1, budget)?;
                }
            }
        }
        Value::Array(items) => {
            for child in items {
                check_schema_references(child, depth + 1, budget)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn schema_error(message: &str) -> ProxyError {
    // Do not echo raw schemas/descriptions: they may contain private information.
    ProxyError::InvalidRequest(format!("Grok 工具参数兼容检查失败：{message}"))
}

/// Returns false only when the schema provably cannot match an object.
fn constrain_object(
    schema: &mut Value,
    depth: usize,
    budget: &mut usize,
) -> Result<bool, ProxyError> {
    if depth > MAX_SCHEMA_DEPTH || *budget == 0 {
        return Err(schema_error("根联合结构过深或过大，请简化工具定义"));
    }
    *budget -= 1;
    if schema == &Value::Bool(false) {
        return Ok(false);
    }
    if schema == &Value::Bool(true) {
        *schema = json!({"type":"object"});
        return Ok(true);
    }
    let Some(object) = schema.as_object_mut() else {
        return Err(schema_error("根参数分支不是合法 JSON Schema"));
    };
    if let Some(kind) = object.get("type") {
        let allows_object = match kind {
            Value::String(kind) => kind == "object",
            Value::Array(kinds) if !kinds.is_empty() && kinds.iter().all(Value::is_string) => {
                kinds.iter().any(|kind| kind.as_str() == Some("object"))
            }
            _ => return Err(schema_error("根参数 type 无效")),
        };
        if !allows_object {
            return Ok(false);
        }
    }
    object.insert("type".into(), json!("object"));
    for keyword in ["anyOf", "oneOf", "allOf"] {
        let Some(branches) = object.get_mut(keyword) else {
            continue;
        };
        let Some(branches) = branches.as_array_mut() else {
            return Err(schema_error("联合分支必须为数组"));
        };
        if branches.is_empty() {
            return Err(schema_error("联合分支不能为空"));
        }
        let mut kept = Vec::with_capacity(branches.len());
        let mut has_object_branch = false;
        for mut branch in std::mem::take(branches) {
            if constrain_object(&mut branch, depth + 1, budget)? {
                has_object_branch = true;
                // Keep duplicate branches: deduplicating oneOf changes validity.
                kept.push(branch);
            } else if keyword == "allOf" {
                return Ok(false);
            } else {
                // Keep branch indices stable. This branch cannot match an object;
                // an explicit object + unsatisfiable constraint expresses that
                // without turning a null/string branch into an unrestricted tool.
                kept.push(json!({"type":"object","not":{}}));
            }
        }
        if !has_object_branch {
            return Ok(false);
        }
        *branches = kept;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(model: &str, schema: Value) -> Value {
        json!({"model":model,"tools":[{"type":"function","function":{
            "name":"mcp__codex_app__automation_update","strict":false,"parameters":schema
        }}],"tool_choice":{"type":"function","function":{"name":"mcp__codex_app__automation_update"}},
        "messages":[{"role":"tool","tool_call_id":"call_1","content":"private-result"}]})
    }

    #[test]
    fn gemini_removes_only_declaration_strict_and_leaves_gpt_and_nested_fields_untouched() {
        let schema = json!({"type":"object","properties":{"strict":{"type":"boolean"}},"required":["strict"]});
        let mut gemini = request("provider/gemini-3.7-flash", schema.clone());
        let original = gemini.clone();
        adapt_chat_tools(&mut gemini).unwrap();
        assert!(gemini.pointer("/tools/0/function/strict").is_none());
        assert_eq!(gemini["tools"][0]["function"]["parameters"], schema);
        assert_eq!(gemini["messages"], original["messages"]);
        assert_eq!(gemini["tool_choice"], original["tool_choice"]);
        let once = gemini.clone();
        adapt_chat_tools(&mut gemini).unwrap();
        assert_eq!(gemini, once);
        for model in ["gpt-5.6-sol", "deepseek-v4-pro", "not-gemini-3.7"] {
            let mut other = request(model, schema.clone());
            let unchanged = other.clone();
            adapt_chat_tools(&mut other).unwrap();
            assert_eq!(other, unchanged);
        }
    }

    #[test]
    fn grok_marks_implicit_object_branches_without_losing_action_constraints() {
        let branches = json!([
            {"properties":{"mode":{"const":"view"},"id":{"type":"string"}},"required":["mode","id"],"additionalProperties":false},
            {"allOf":[{"properties":{"mode":{"const":"create"}},"required":["mode"]},
                {"anyOf":[{"properties":{"kind":{"const":"cron"}},"required":["kind"]},
                          {"properties":{"kind":{"const":"heartbeat"}},"required":["kind"]}]}]}
        ]);
        let mut body = request("grok-4.6", json!({"type":"object","anyOf":branches}));
        let original = body.clone();
        adapt_chat_tools(&mut body).unwrap();
        let schema = &body["tools"][0]["function"]["parameters"];
        assert_eq!(schema["anyOf"][0]["type"], "object");
        assert_eq!(schema["anyOf"][1]["type"], "object");
        assert_eq!(schema["anyOf"][1]["allOf"][1]["anyOf"][0]["type"], "object");
        assert_eq!(schema["anyOf"][0]["required"], branches[0]["required"]);
        assert_eq!(schema["anyOf"][0]["additionalProperties"], false);
        assert_eq!(body["messages"], original["messages"]);
        assert_eq!(
            body["tools"][0]["function"]["name"],
            original["tools"][0]["function"]["name"]
        );
        assert_eq!(body["tool_choice"], original["tool_choice"]);
        let once = body.clone();
        adapt_chat_tools(&mut body).unwrap();
        assert_eq!(body, once);
    }

    #[test]
    fn removes_only_object_incompatible_union_branches_not_nested_property_unions() {
        let nested = json!({"anyOf":[{"type":"string"},{"type":"null"}]});
        let mut body = request(
            "grok-4.5",
            json!({"type":"object","oneOf":[
                {"type":"null"}, {"type":["string","object"],"properties":{"name":nested}},
                {"type":"object","properties":{"name":nested}}
            ]}),
        );
        adapt_chat_tools(&mut body).unwrap();
        let branches = body["tools"][0]["function"]["parameters"]["oneOf"]
            .as_array()
            .unwrap();
        assert_eq!(branches.len(), 3);
        assert_eq!(branches[0], json!({"type":"object","not":{}}));
        assert_eq!(branches[1]["properties"]["name"], nested);
        assert_eq!(branches[1], branches[2]); // Duplicate oneOf branches deliberately retained.
    }

    #[test]
    fn rejects_impossible_or_malformed_roots_atomically_instead_of_dropping_tools() {
        for schema in [
            json!({"type":"object","anyOf":[{"type":"null"},{"type":"string"}]}),
            json!({"type":"object","allOf":[{"type":"string"}]}),
            json!({"type":"object","oneOf":[]}),
            json!({"type":"object","anyOf":{}}),
        ] {
            let mut body = request("grok-4.6", schema);
            let original = body.clone();
            assert!(adapt_chat_tools(&mut body).is_err());
            assert_eq!(body, original);
        }
    }

    #[test]
    fn root_constraints_refs_and_definitions_are_preserved_and_recursion_is_bounded() {
        let mut body = request(
            "grok-4.6",
            json!({
                "type":"object", "$defs":{"value":{"oneOf":[{"type":"string"},{"type":"number"}]}},
                "anyOf":[{"$ref":"#/$defs/action"}], "not":{"required":["forbidden"]},
                "unevaluatedProperties":false
            }),
        );
        let original = body.clone();
        adapt_chat_tools(&mut body).unwrap();
        let parameters = &body["tools"][0]["function"]["parameters"];
        for key in ["$defs", "not", "unevaluatedProperties"] {
            assert_eq!(
                parameters[key],
                original["tools"][0]["function"]["parameters"][key]
            );
        }
        assert_eq!(parameters["anyOf"][0]["$ref"], "#/$defs/action");
        let mut deep = json!({"type":"object"});
        for _ in 0..60 {
            deep = json!({"allOf":[deep]});
        }
        assert!(adapt_chat_tools(&mut request("grok-4.6", deep)).is_err());
    }

    #[test]
    fn codex_entrypoint_handles_flat_nested_and_namespaced_tools_without_argument_rewrapping() {
        use super::super::transform_codex_chat::responses_to_chat_completions;
        for model in ["grok-4.5", "grok-4.6", "gemini-3.7-flash"] {
            let schema = json!({"anyOf":[
                {"properties":{"mode":{"const":"view"}},"required":["mode"]},
                {"allOf":[{"properties":{"mode":{"const":"create"}},"required":["mode"]}]}
            ]});
            let converted = responses_to_chat_completions(json!({
                "model":model, "tools":[
                    {"type":"function","name":"flat","parameters":schema,"strict":true},
                    {"type":"function","function":{"name":"nested","parameters":schema,"strict":false}},
                    {"type":"namespace","name":"mcp__codex_app","tools":[
                        {"type":"function","name":"automation_update","parameters":schema,"strict":false}
                    ]}
                ], "input":[{"type":"message","role":"user","content":"hi"}]
            })).unwrap();
            let tools = converted["tools"].as_array().unwrap();
            assert_eq!(tools.len(), 3);
            assert_eq!(tools[0]["function"]["name"], "flat");
            assert_eq!(tools[1]["function"]["name"], "nested");
            for tool in tools {
                if is_grok_model(model) {
                    assert_eq!(tool["function"]["parameters"]["anyOf"][1]["type"], "object");
                    assert_eq!(
                        tool["function"]["parameters"]["anyOf"][0]["required"],
                        json!(["mode"])
                    );
                } else {
                    assert!(tool["function"].get("strict").is_none());
                }
            }
        }
        assert!(responses_to_chat_completions(json!({
            "model":"grok-4.6", "tools":[{"type":"function","name":"invalid",
            "parameters":{"type":"string"}}],"input":"hi"
        }))
        .is_err());
    }

    #[test]
    fn arbitrary_property_names_and_constant_values_are_not_schema_keywords() {
        let schema = json!({"type":"object","properties":{
            "$ref":{"type":"string"},
            "value":{"const":{"$ref":"private-literal"}}
        },"anyOf":[{"required":["$ref"]},{"required":["value"]}]});
        let mut body = request("grok-4.6", schema.clone());
        adapt_chat_tools(&mut body).unwrap();
        assert_eq!(
            body["tools"][0]["function"]["parameters"]["properties"],
            schema["properties"]
        );
        assert!(adapt_chat_tools(&mut request("grok-4.6",
            json!({"anyOf":[{"type":"string"},{"type":"object"}],"properties":{"value":{"$ref":"#/anyOf/0"}}})
        )).is_err());
    }

    // Small independent validator for the subset used by automation fixtures.
    // It checks semantic equivalence for object calls, not merely output shape.
    fn accepts(schema: &Value, value: &Value) -> bool {
        if let Some(boolean) = schema.as_bool() {
            return boolean;
        }
        if let Some(kind) = schema.get("type") {
            let matches = |kind: &str| match kind {
                "object" => value.is_object(),
                "string" => value.is_string(),
                "null" => value.is_null(),
                "boolean" => value.is_boolean(),
                _ => false,
            };
            if !(kind.as_str().is_some_and(matches)
                || kind.as_array().is_some_and(|kinds| {
                    kinds.iter().any(|kind| kind.as_str().is_some_and(matches))
                }))
            {
                return false;
            }
        }
        if schema
            .get("const")
            .is_some_and(|constant| constant != value)
        {
            return false;
        }
        if schema.get("not").is_some_and(|inner| accepts(inner, value)) {
            return false;
        }
        for key in ["allOf", "anyOf", "oneOf"] {
            if let Some(branches) = schema.get(key).and_then(Value::as_array) {
                let count = branches
                    .iter()
                    .filter(|branch| accepts(branch, value))
                    .count();
                if (key == "allOf" && count != branches.len())
                    || (key == "anyOf" && count == 0)
                    || (key == "oneOf" && count != 1)
                {
                    return false;
                }
            }
        }
        if let Some(object) = value.as_object() {
            if schema
                .get("required")
                .and_then(Value::as_array)
                .is_some_and(|keys| {
                    keys.iter()
                        .any(|key| !object.contains_key(key.as_str().unwrap()))
                })
            {
                return false;
            }
            let properties = schema.get("properties").and_then(Value::as_object);
            for (key, value) in object {
                if let Some(child) = properties.and_then(|properties| properties.get(key)) {
                    if !accepts(child, value) {
                        return false;
                    }
                } else if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
                    return false;
                }
            }
        }
        true
    }

    #[test]
    fn union_adaptation_preserves_valid_and_invalid_automation_object_calls() {
        for keyword in ["anyOf", "oneOf"] {
            let mut schema = json!({"type":"object"});
            schema[keyword] = json!([
                {"type":"null"},
                {"properties":{"mode":{"const":"view"},"id":{"type":"string"}},"required":["mode","id"],"additionalProperties":false},
                {"allOf":[
                    {"properties":{"mode":{"const":"create"}},"required":["mode"]},
                    {"anyOf":[{"properties":{"kind":{"const":"cron"}},"required":["kind"]},
                              {"properties":{"kind":{"const":"heartbeat"}},"required":["kind"]}]}
                ]}
            ]);
            let mut body = request("grok-4.6", schema.clone());
            adapt_chat_tools(&mut body).unwrap();
            let adapted = &body["tools"][0]["function"]["parameters"];
            for mode in ["view", "create", "delete", "unknown"] {
                for kind in ["cron", "heartbeat", "bad"] {
                    for id in [json!("abc"), json!(null)] {
                        let value = json!({"mode":mode,"kind":kind,"id":id});
                        assert_eq!(accepts(&schema, &value), accepts(adapted, &value));
                    }
                }
            }
            for value in [
                json!({}),
                json!({"mode":"view","id":"abc"}),
                json!({"mode":"create","kind":"cron"}),
            ] {
                assert_eq!(accepts(&schema, &value), accepts(adapted, &value));
            }
        }
    }

    #[tokio::test]
    async fn grok_namespaced_tool_round_trip_keeps_call_id_and_fragmented_arguments() {
        use super::super::streaming_codex_chat::create_responses_sse_stream_from_chat_with_context;
        use super::super::transform_codex_chat::{
            build_codex_tool_context_from_request, responses_to_chat_completions,
        };
        use bytes::Bytes;
        use futures::{stream, StreamExt};
        let request = json!({
            "model":"grok-4.6","tools":[{"type":"namespace","name":"mcp__codex_app","tools":[{
                "type":"function","name":"automation_update","parameters":{
                    "anyOf":[{"properties":{"mode":{"const":"view"},"id":{"type":"string"}},"required":["mode","id"]}]
                }
            }]}], "input":[{"type":"message","role":"user","content":"hi"}]
        });
        let context = build_codex_tool_context_from_request(&request);
        let chat = responses_to_chat_completions(request.clone()).unwrap();
        let name = chat["tools"][0]["function"]["name"].as_str().unwrap();
        let events = [
            json!({"id":"chatcmpl_1","model":"grok-4.6","choices":[{"delta":{"tool_calls":[{
                "index":0,"id":"call_123","type":"function","function":{"name":name,"arguments":"{\"mode\":"}
            }]}}]}),
            json!({"id":"chatcmpl_1","model":"grok-4.6","choices":[{"delta":{"tool_calls":[{
                "index":0,"function":{"arguments":"\"view\",\"id\":\"example\"}"}
            }]},"finish_reason":"tool_calls"}]}),
        ];
        let chunks: Vec<Result<Bytes, std::io::Error>> = events
            .iter()
            .map(|event| Ok(Bytes::from(format!("data: {event}\n\n"))))
            .collect();
        let output =
            create_responses_sse_stream_from_chat_with_context(stream::iter(chunks), context);
        tokio::pin!(output);
        let mut wire = String::new();
        while let Some(chunk) = output.next().await {
            wire.push_str(std::str::from_utf8(&chunk.unwrap()).unwrap());
        }
        let completed: Value = wire
            .split("\n\n")
            .filter_map(|block| {
                block
                    .lines()
                    .find_map(|line| line.strip_prefix("data: "))
                    .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
            })
            .find(|event| event["type"] == "response.completed")
            .unwrap();
        let call = completed["response"]["output"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["type"] == "function_call")
            .unwrap();
        assert_eq!(call["name"], "automation_update");
        assert_eq!(call["namespace"], "mcp__codex_app");
        assert_eq!(call["call_id"], "call_123");
        assert_eq!(
            serde_json::from_str::<Value>(call["arguments"].as_str().unwrap()).unwrap(),
            json!({"mode":"view","id":"example"})
        );
        let mut followup = request;
        followup["input"] =
            json!([call, {"type":"function_call_output","call_id":"call_123","output":"result"}]);
        let next = responses_to_chat_completions(followup).unwrap();
        let messages = next["messages"].as_array().unwrap();
        assert!(messages
            .iter()
            .any(|message| message["role"] == "tool" && message["tool_call_id"] == "call_123"));
    }
}
