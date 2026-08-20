const SHAPES = {
  "recon": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "found",
      "gaps",
      "confidence"
    ],
    "properties": {
      "found": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "claim",
            "evidence"
          ],
          "properties": {
            "id": {
              "type": "string",
              "maxLength": 80
            },
            "claim": {
              "type": "string",
              "maxLength": 600
            },
            "evidence": {
              "type": "string",
              "maxLength": 2000
            },
            "shape": {
              "type": "string",
              "maxLength": 40
            }
          }
        }
      },
      "gaps": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 300
        }
      },
      "confidence": {
        "type": "string",
        "enum": [
          "low",
          "med",
          "high"
        ]
      }
    }
  },
  "spec": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "decisions",
      "nonGoals",
      "acceptance"
    ],
    "properties": {
      "decisions": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "choice",
            "why"
          ],
          "properties": {
            "id": {
              "type": "string",
              "maxLength": 80
            },
            "choice": {
              "type": "string",
              "maxLength": 600
            },
            "why": {
              "type": "string",
              "maxLength": 400
            }
          }
        }
      },
      "nonGoals": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 300
        }
      },
      "acceptance": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 300
        }
      }
    }
  },
  "implement": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "changed",
      "skipped",
      "risks"
    ],
    "properties": {
      "changed": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "why"
          ],
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 300
            },
            "why": {
              "type": "string",
              "maxLength": 300
            }
          }
        }
      },
      "skipped": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 300
        }
      },
      "risks": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 300
        }
      },
      "cause": {
        "type": "string",
        "maxLength": 600
      }
    }
  },
  "verify": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "checks",
      "verdict"
    ],
    "properties": {
      "checks": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "cmd",
            "pass",
            "evidence"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 120
            },
            "cmd": {
              "type": "string",
              "maxLength": 200
            },
            "pass": {
              "type": "boolean"
            },
            "evidence": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1200
            }
          }
        }
      },
      "verdict": {
        "type": "string",
        "enum": [
          "pass",
          "fail",
          "blocked"
        ]
      }
    }
  },
  "review": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "findings",
      "blocking"
    ],
    "properties": {
      "findings": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "sev",
            "loc",
            "claim",
            "fix"
          ],
          "properties": {
            "sev": {
              "type": "string",
              "enum": [
                "blocker",
                "major",
                "minor",
                "nit"
              ]
            },
            "loc": {
              "type": "string",
              "maxLength": 200
            },
            "claim": {
              "type": "string",
              "maxLength": 500
            },
            "fix": {
              "type": "string",
              "maxLength": 500
            }
          }
        }
      },
      "blocking": {
        "type": "boolean"
      }
    }
  },
  "synthesis": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "summary",
      "byInput"
    ],
    "properties": {
      "summary": {
        "type": "string",
        "maxLength": 1500
      },
      "byInput": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "kept",
            "dropped",
            "why"
          ],
          "properties": {
            "id": {
              "type": "string",
              "maxLength": 80
            },
            "kept": {
              "type": "boolean"
            },
            "dropped": {
              "type": "boolean"
            },
            "why": {
              "type": "string",
              "maxLength": 300
            }
          }
        }
      }
    }
  }
};

const recon = await agent(`look at the repo`, { label: 'recon', schema: SHAPES.recon, agentTimeoutMs: 600000 });
const [a, b] = await parallel([
  agent(`review joining: ${JSON.stringify(recon.found)}`, { label: 'review_joining', schema: SHAPES.review, agentTimeoutMs: 600000 }),
  agent(`review team: ${JSON.stringify(recon.found)}`, { label: 'review_team', schema: SHAPES.review, agentTimeoutMs: 600000 }),
]);
await agent(`close: ${a.blocking} ${b.blocking}`, { label: 'close', schema: SHAPES.synthesis, agentTimeoutMs: 600000 });
