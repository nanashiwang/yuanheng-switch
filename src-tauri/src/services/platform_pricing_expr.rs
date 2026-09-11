//! A bounded interpreter for the platform's token pricing expressions.
//! No general-purpose evaluator, request data access, or remote code execution.
use chrono::{Datelike, TimeZone, Timelike};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Clone, Debug)]
enum Token {
    Number(Decimal),
    Name(String),
    Text(String),
    Op(String),
}

fn tokenize(input: &str) -> Option<Vec<Token>> {
    if input.len() > 8192 {
        return None;
    }
    let mut chars = input.chars().peekable();
    let mut out = Vec::new();
    while let Some(c) = chars.next() {
        if c.is_whitespace() {
            continue;
        }
        let token = if c.is_ascii_digit() || c == '.' {
            let mut s = c.to_string();
            while chars
                .peek()
                .is_some_and(|c| c.is_ascii_digit() || *c == '.')
            {
                s.push(chars.next()?);
            }
            Token::Number(Decimal::from_str(&s).ok()?)
        } else if c.is_ascii_alphabetic() || c == '_' {
            let mut s = c.to_string();
            while chars
                .peek()
                .is_some_and(|c| c.is_ascii_alphanumeric() || *c == '_')
            {
                s.push(chars.next()?);
            }
            Token::Name(s)
        } else if c == '"' {
            let mut s = String::new();
            loop {
                let c = chars.next()?;
                if c == '"' {
                    break;
                }
                if c == '\\' {
                    return None;
                }
                s.push(c);
            }
            Token::Text(s)
        } else {
            let mut s = c.to_string();
            if chars.peek().is_some_and(|n| {
                matches!(
                    (c, *n),
                    ('<', '=') | ('>', '=') | ('=', '=') | ('!', '=') | ('&', '&') | ('|', '|')
                )
            }) {
                s.push(chars.next()?);
            }
            if ![
                "(", ")", ",", "?", ":", "+", "-", "*", "/", "<", "<=", ">", ">=", "==", "!=",
                "&&", "||",
            ]
            .contains(&s.as_str())
            {
                return None;
            }
            Token::Op(s)
        };
        out.push(token);
        if out.len() > 1024 {
            return None;
        }
    }
    Some(out)
}

struct Parser<'a> {
    tokens: Vec<Token>,
    pos: usize,
    vars: &'a HashMap<&'static str, Decimal>,
    at: i64,
}
impl Parser<'_> {
    fn take(&mut self, op: &str) -> bool {
        if matches!(self.tokens.get(self.pos), Some(Token::Op(s)) if s == op) {
            self.pos += 1;
            true
        } else {
            false
        }
    }
    fn expression(&mut self, min: u8, depth: u8) -> Option<Decimal> {
        if depth > 32 {
            return None;
        }
        let tok = self.tokens.get(self.pos)?.clone();
        self.pos += 1;
        let mut lhs = match tok {
            Token::Number(n) => n,
            Token::Op(s) if s == "(" => {
                let n = self.expression(0, depth + 1)?;
                if !self.take(")") {
                    return None;
                }
                n
            }
            Token::Name(s) if self.take("(") => {
                let Token::Text(text) = self.tokens.get(self.pos)?.clone() else {
                    return None;
                };
                self.pos += 1;
                if s == "tier" {
                    if !self.take(",") {
                        return None;
                    }
                    let n = self.expression(0, depth + 1)?;
                    if !self.take(")") {
                        return None;
                    }
                    n
                } else {
                    if !self.take(")") {
                        return None;
                    }
                    let offset = match text.as_str() {
                        "Asia/Shanghai" => 8 * 3600,
                        "UTC" => 0,
                        _ => return None,
                    };
                    let date = chrono::FixedOffset::east_opt(offset)?
                        .timestamp_opt(self.at, 0)
                        .single()?;
                    Decimal::from(match s.as_str() {
                        "hour" => date.hour(),
                        "minute" => date.minute(),
                        "weekday" => date.weekday().num_days_from_sunday(),
                        "month" => date.month(),
                        "day" => date.day(),
                        _ => return None,
                    })
                }
            }
            Token::Name(s) => *self.vars.get(s.as_str())?,
            _ => return None,
        };
        while let Some(Token::Op(op)) = self.tokens.get(self.pos).cloned() {
            if op == "?" && min == 0 {
                self.pos += 1;
                let yes = self.expression(0, depth + 1)?;
                if !self.take(":") {
                    return None;
                }
                let no = self.expression(0, depth + 1)?;
                lhs = if lhs != Decimal::ZERO { yes } else { no };
                continue;
            }
            let prec = match op.as_str() {
                "||" => 1,
                "&&" => 2,
                "==" | "!=" | "<" | "<=" | ">" | ">=" => 3,
                "+" | "-" => 4,
                "*" | "/" => 5,
                _ => break,
            };
            if prec < min {
                break;
            }
            self.pos += 1;
            let rhs = self.expression(prec + 1, depth + 1)?;
            let boolean = |b| if b { Decimal::ONE } else { Decimal::ZERO };
            lhs = match op.as_str() {
                "+" => lhs.checked_add(rhs)?,
                "-" => lhs.checked_sub(rhs)?,
                "*" => lhs.checked_mul(rhs)?,
                "/" => lhs.checked_div(rhs)?,
                "<" => boolean(lhs < rhs),
                "<=" => boolean(lhs <= rhs),
                ">" => boolean(lhs > rhs),
                ">=" => boolean(lhs >= rhs),
                "==" => boolean(lhs == rhs),
                "!=" => boolean(lhs != rhs),
                "&&" => boolean(lhs != Decimal::ZERO && rhs != Decimal::ZERO),
                "||" => boolean(lhs != Decimal::ZERO || rhs != Decimal::ZERO),
                _ => return None,
            };
        }
        Some(lhs)
    }
}

pub(super) fn evaluate(
    expr: &str,
    vars: &HashMap<&'static str, Decimal>,
    at: i64,
) -> Option<Decimal> {
    let mut parser = Parser {
        tokens: tokenize(expr)?,
        pos: 0,
        vars,
        at,
    };
    let amount = parser.expression(0, 0)?;
    (parser.pos == parser.tokens.len() && amount >= Decimal::ZERO).then_some(amount)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn evaluates_tiers_time_and_rejects_unrecognized_code() {
        let vars = HashMap::from([("len", Decimal::from(272000)), ("p", Decimal::from(10))]);
        assert_eq!(
            evaluate(
                "len <= 272000 ? tier(\"标准\", p * 50) : tier(\"长\", p * 100)",
                &vars,
                0
            ),
            Some(Decimal::from(500))
        );
        let at = chrono::DateTime::parse_from_rfc3339("2026-09-11T10:00:00+08:00")
            .unwrap()
            .timestamp();
        assert_eq!(evaluate("weekday(\"Asia/Shanghai\") >= 1 && weekday(\"Asia/Shanghai\") <= 5 && (hour(\"Asia/Shanghai\") < 12 || hour(\"UTC\") > 20) ? 2 : 1", &vars, at), Some(Decimal::from(2)));
        for expr in [
            "unknown * 1",
            "1 / 0",
            "1; 2",
            "system(\"x\")",
            "1 +",
            "tier(\"x\", -1)",
        ] {
            assert_eq!(evaluate(expr, &vars, at), None, "{expr}");
        }
        assert_eq!(
            evaluate(&format!("{}1{}", "(".repeat(40), ")".repeat(40)), &vars, at),
            None
        );
    }
}
