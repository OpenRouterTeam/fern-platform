import { convertToLlmTxtMarkdown } from "./llm-txt-md";

describe("llm-txt-md", () => {
  describe("convertToLlmTxtMarkdown", () => {
    it("should handle regular markdown without MDX components", () => {
      const markdown = "# Test\n\nThis is regular markdown.";
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "md");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("This is regular markdown.");
    });

    it("should expand TSFetchCodeBlock components to code blocks", () => {
      const markdown = `# Test

<TSFetchCodeBlock>
console.log("Hello, world!");
</TSFetchCodeBlock>`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "mdx");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("```typescript");
      expect(result).toContain('console.log("Hello, world!");');
      expect(result).not.toContain("<TSFetchCodeBlock>");
    });

    it("should expand CodeGroup components to multiple code blocks", () => {
      const markdown = `# Test

<CodeGroup>
<Code language="javascript">
console.log("JS code");
</Code>
<Code language="python">
print("Python code")
</Code>
</CodeGroup>`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "mdx");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("```javascript");
      expect(result).toContain('console.log("JS code");');
      expect(result).toContain("```python");
      expect(result).toContain('print("Python code")');
      expect(result).not.toContain("<CodeGroup>");
      expect(result).not.toContain("<Code");
    });

    it("should expand Template components with variable replacement", () => {
      const markdown = `# Test

<Template data={{"API_KEY": "test-key-123", "BASE_URL": "https://api.example.com"}}>
Use your API key: {{API_KEY}}
Base URL: {{BASE_URL}}
</Template>`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "mdx");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("Use your API key: test-key-123");
      expect(result).toContain("Base URL: https://api.example.com");
      expect(result).not.toContain("<Template");
      expect(result).not.toContain("{{API_KEY}}");
      expect(result).not.toContain("{{BASE_URL}}");
    });

    it("should apply global template variables", () => {
      const markdown = `# Test

Your free credits threshold is {{FREE_MODEL_CREDITS_THRESHOLD}}.
Use API key: {{API_KEY_REF}}`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "mdx");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("Your free credits threshold is 10");
      expect(result).toContain("Use API key: your-api-key");
      expect(result).not.toContain("{{FREE_MODEL_CREDITS_THRESHOLD}}");
      expect(result).not.toContain("{{API_KEY_REF}}");
    });

    it("should handle mixed content with multiple component types", () => {
      const markdown = `# Mixed Content Test

Regular markdown paragraph.

<TSFetchCodeBlock>
const apiKey = "{{API_KEY_REF}}";
</TSFetchCodeBlock>

<Template data={{"USER_NAME": "Alice"}}>
Hello {{USER_NAME}}!
</Template>

<CodeGroup>
<Code language="bash">
curl -H "Authorization: Bearer {{API_KEY_REF}}"
</Code>
</CodeGroup>

More regular content with {{FREE_MODEL_CREDITS_THRESHOLD}} credits.`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Mixed Test", "mdx");
      
      expect(result).toContain("# Mixed Test");
      expect(result).toContain("Regular markdown paragraph.");
      expect(result).toContain("```typescript");
      expect(result).toContain('const apiKey = "your-api-key";');
      expect(result).toContain("Hello Alice!");
      expect(result).toContain("```bash");
      expect(result).toContain('curl -H "Authorization: Bearer your-api-key"');
      expect(result).toContain("More regular content with 10 credits.");
      
      expect(result).not.toContain("<TSFetchCodeBlock>");
      expect(result).not.toContain("<Template");
      expect(result).not.toContain("<CodeGroup>");
      expect(result).not.toContain("{{");
    });

    it("should handle empty or malformed components gracefully", () => {
      const markdown = `# Edge Cases

<TSFetchCodeBlock></TSFetchCodeBlock>

<CodeGroup></CodeGroup>

<Template></Template>

Regular content continues.`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Edge Cases", "mdx");
      
      expect(result).toContain("# Edge Cases");
      expect(result).toContain("Regular content continues.");
      expect(result).not.toContain("<TSFetchCodeBlock>");
      expect(result).not.toContain("<CodeGroup>");
      expect(result).not.toContain("<Template>");
    });

    it("should preserve content when format is 'md' instead of 'mdx'", () => {
      const markdown = `# Test

<TSFetchCodeBlock>
console.log("test");
</TSFetchCodeBlock>`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "md");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("<TSFetchCodeBlock>");
    });

    it("should handle TSFetchCodeBlock with src attribute", () => {
      const markdown = `# Test

<TSFetchCodeBlock src="https://example.com/code.ts">
</TSFetchCodeBlock>`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Test Page", "mdx");
      
      expect(result).toContain("# Test Page");
      expect(result).toContain("```typescript");
      expect(result).toContain("// Code from: https://example.com/code.ts");
      expect(result).not.toContain("<TSFetchCodeBlock>");
    });

    it("should extract title and description from frontmatter", () => {
      const markdown = `---
title: "Custom Title"
description: "Custom description"
---

# Heading

Content here.`;
      
      const result = convertToLlmTxtMarkdown(markdown, "Default Title", "md");
      
      expect(result).toContain("# Custom Title");
      expect(result).toContain("> Custom description");
      expect(result).toContain("Content here.");
    });
  });
});
