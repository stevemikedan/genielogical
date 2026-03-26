import { describe, it, expect } from 'vitest';
import { tokenize } from './tokenizer.ts';

describe('tokenize', () => {
  it('should parse basic GEDCOM lines', () => {
    const text = `0 HEAD
1 SOUR MyApp
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 TRLR`;

    const tokens = tokenize(text);
    expect(tokens).toHaveLength(8);

    // HEAD record
    expect(tokens[0]).toEqual({
      level: 0,
      xref: null,
      tag: 'HEAD',
      value: '',
      lineNumber: 1,
    });

    // INDI record with xref (index 4: HEAD=0, SOUR=1, GEDC=2, VERS=3, INDI=4)
    expect(tokens[4]).toEqual({
      level: 0,
      xref: '@I1@',
      tag: 'INDI',
      value: '',
      lineNumber: 5,
    });

    // NAME with value
    expect(tokens[5]).toEqual({
      level: 1,
      xref: null,
      tag: 'NAME',
      value: 'John /Smith/',
      lineNumber: 6,
    });
  });

  it('should handle BOM at start of file', () => {
    const text = '\uFEFF0 HEAD\n1 CHAR UTF-8\n0 TRLR';
    const tokens = tokenize(text);
    expect(tokens[0].tag).toBe('HEAD');
    expect(tokens[0].level).toBe(0);
  });

  it('should skip blank lines', () => {
    const text = `0 HEAD

1 SOUR Test

0 TRLR`;

    const tokens = tokenize(text);
    expect(tokens).toHaveLength(3);
    expect(tokens[0].tag).toBe('HEAD');
    expect(tokens[1].tag).toBe('SOUR');
    expect(tokens[2].tag).toBe('TRLR');
  });

  it('should handle CONT (continuation with newline)', () => {
    const text = `0 @S1@ SOUR
1 TEXT First line
2 CONT Second line
2 CONT Third line`;

    const tokens = tokenize(text);
    expect(tokens).toHaveLength(2);
    expect(tokens[1].value).toBe('First line\nSecond line\nThird line');
  });

  it('should handle CONC (concatenation without newline)', () => {
    const text = `0 @S1@ SOUR
1 TEXT A very long value that was sp
2 CONC lit across lines`;

    const tokens = tokenize(text);
    expect(tokens).toHaveLength(2);
    expect(tokens[1].value).toBe('A very long value that was split across lines');
  });

  it('should handle mixed CONT and CONC', () => {
    const text = `0 @S1@ SOUR
1 TEXT First line that is lo
2 CONC ng enough
2 CONT Second line`;

    const tokens = tokenize(text);
    expect(tokens).toHaveLength(2);
    expect(tokens[1].value).toBe('First line that is long enough\nSecond line');
  });

  it('should handle Windows-style line endings (CRLF)', () => {
    const text = '0 HEAD\r\n1 SOUR Test\r\n0 TRLR\r\n';
    const tokens = tokenize(text);
    expect(tokens).toHaveLength(3);
  });

  it('should preserve xref format', () => {
    const text = '0 @I123@ INDI\n1 NAME Test /Person/';
    const tokens = tokenize(text);
    expect(tokens[0].xref).toBe('@I123@');
  });

  it('should uppercase tag names', () => {
    const text = '0 head\n1 sour Test';
    const tokens = tokenize(text);
    expect(tokens[0].tag).toBe('HEAD');
    expect(tokens[1].tag).toBe('SOUR');
  });

  it('should track line numbers correctly', () => {
    const text = `0 HEAD
1 SOUR Test
0 @I1@ INDI
1 NAME John /Doe/
0 TRLR`;

    const tokens = tokenize(text);
    expect(tokens[0].lineNumber).toBe(1);
    expect(tokens[1].lineNumber).toBe(2);
    expect(tokens[2].lineNumber).toBe(3);
    expect(tokens[3].lineNumber).toBe(4);
    expect(tokens[4].lineNumber).toBe(5);
  });

  it('should handle empty file', () => {
    const tokens = tokenize('');
    expect(tokens).toHaveLength(0);
  });

  it('should handle custom/vendor tags starting with underscore', () => {
    const text = `0 @I1@ INDI
1 NAME John /Smith/
1 _APID 1,1234::5678`;

    const tokens = tokenize(text);
    expect(tokens).toHaveLength(3);
    expect(tokens[2].tag).toBe('_APID');
    expect(tokens[2].value).toBe('1,1234::5678');
  });
});
