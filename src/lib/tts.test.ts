import { describe, expect, it } from "bun:test";
import { htmlToPlainText } from "./tts";

describe("htmlToPlainText", () => {
  it("should remove basic HTML tags", () => {
    const html = "<p>Hello <strong>world</strong>!</p>";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world !");
  });

  it("should remove script tags and their content", () => {
    const html = `
      <div>Before script</div>
      <script>console.log('remove me');</script>
      <div>After script</div>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("console.log");
    expect(result).toContain("Before script");
    expect(result).toContain("After script");
  });

  it("should remove style tags and their content", () => {
    const html = `
      <div>Content</div>
      <style>.hidden { display: none; }</style>
      <div>More content</div>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("display: none");
    expect(result).toContain("Content");
    expect(result).toContain("More content");
  });

  it("should decode HTML entities", () => {
    const html = "Hello&nbsp;world &amp; friends&lt;br&gt;";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world & friends<br>");
  });

  it("should decode quote entities", () => {
    const html = "He said &quot;Hello&quot; and &apos;Goodbye&apos;";
    const result = htmlToPlainText(html);
    expect(result).toBe("He said \"Hello\" and 'Goodbye'");
  });

  it("should clean up excessive whitespace", () => {
    const html = "<p>Hello    \n\n   world</p>";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world");
  });

  it("should trim leading and trailing whitespace", () => {
    const html = "   <p>Hello world</p>   ";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world");
  });

  it("should handle empty string", () => {
    const html = "";
    const result = htmlToPlainText(html);
    expect(result).toBe("");
  });

  it("should handle string with only tags", () => {
    const html = "<div><span><p></p></span></div>";
    const result = htmlToPlainText(html);
    expect(result).toBe("");
  });

  it("should handle nested tags", () => {
    const html =
      "<div><p>Outer <span>inner <strong>deeply nested</strong></span></p></div>";
    const result = htmlToPlainText(html);
    expect(result).toBe("Outer inner deeply nested");
  });

  it("should handle mixed content with tags, entities, and whitespace", () => {
    const html = `
      <article>
        <h1>Article&nbsp;Title</h1>
        <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
        <script>alert('bad');</script>
        <p>Quote: &quot;Hello&quot; &amp; &lt;tag&gt;</p>
      </article>
    `;
    const result = htmlToPlainText(html);
    expect(result).toContain("Article Title");
    expect(result).toContain("This is a paragraph with bold and italic text.");
    expect(result).toContain('Quote: "Hello" & <tag>');
    expect(result).not.toContain("alert");
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<strong>");
  });

  it("should handle self-closing tags", () => {
    const html = "Before <br /> middle <img src='test.jpg' /> after";
    const result = htmlToPlainText(html);
    expect(result).toBe("Before middle after");
  });

  it("should handle complex article HTML", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>.test { color: red; }</style>
          <script>var x = 1;</script>
        </head>
        <body>
          <h1>Article Title</h1>
          <p class="intro">This is the introduction with &nbsp; spaces.</p>
          <div>
            <p>First paragraph.</p>
            <p>Second&nbsp;paragraph with&nbsp;nbsp.</p>
          </div>
        </body>
      </html>
    `;
    const result = htmlToPlainText(html);
    expect(result).toContain("Article Title");
    expect(result).toContain("This is the introduction with spaces.");
    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph with nbsp.");
    expect(result).not.toContain("<!DOCTYPE");
    expect(result).not.toContain("<html>");
    expect(result).not.toContain("var x = 1");
    expect(result).not.toContain("color: red");
  });

  it("should handle tags with attributes", () => {
    const html = '<a href="https://example.com" class="link">Click here</a>';
    const result = htmlToPlainText(html);
    expect(result).toBe("Click here");
  });

  it("should handle multiline script tags", () => {
    const html = `
      <p>Before</p>
      <script>
        function test() {
          console.log('test');
        }
      </script>
      <p>After</p>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("function test");
    expect(result).not.toContain("console.log");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  it("should handle multiline style tags", () => {
    const html = `
      <p>Content</p>
      <style>
        body {
          margin: 0;
          padding: 0;
        }
      </style>
      <p>More</p>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("margin");
    expect(result).not.toContain("padding");
    expect(result).toContain("Content");
    expect(result).toContain("More");
  });

  it("should preserve text order", () => {
    const html = "<div>First</div><div>Second</div><div>Third</div>";
    const result = htmlToPlainText(html);
    expect(result).toContain("First");
    expect(result).toContain("Second");
    expect(result).toContain("Third");
    const firstIndex = result.indexOf("First");
    const secondIndex = result.indexOf("Second");
    const thirdIndex = result.indexOf("Third");
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });
});
