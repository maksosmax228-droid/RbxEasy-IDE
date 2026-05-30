// --- LEXER ---
export enum TokenType {
  Keyword, Identifier, Number, String, Operator, Punctuation, EOF
}
export interface Token { type: TokenType; value: string; line: number; col: number; }

const KEYWORDS = ['func', 'var', 'if', 'else', 'elseif', 'while', 'for', 'return', 'true', 'false', 'nil', 'local', 'function', 'break', 'continue', 'include', 'luau', 'and', 'or', 'not', 'then', 'do', 'end'];

export class Lexer {
  private input: string; private pos = 0; private line = 1; private col = 1;
  constructor(input: string) { this.input = input; }
  tokenize(): Token[] {
    const tokens: Token[] = [];
    if (!this.input.trim()) {
      tokens.push({ type: TokenType.EOF, value: '', line: 1, col: 1 });
      return tokens;
    }
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (/\s/.test(char)) {
        if (char === '\n') { this.line++; this.col = 1; } else { this.col++; }
        this.pos++; continue;
      }
      if (this.input.startsWith('//', this.pos)) {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.pos++;
        continue;
      }
      if (/[0-9]/.test(char)) { tokens.push(this.readNumber()); continue; }
      if (/[a-zA-Z_]/.test(char)) { 
        const id = this.readIdentifier();
        if (id.value === 'luau') {
          let tempPos = this.pos;
          let tempLine = this.line;
          let tempCol = this.col;
          while (tempPos < this.input.length && /\s/.test(this.input[tempPos])) {
            if (this.input[tempPos] === '\n') { tempLine++; tempCol = 1; } else { tempCol++; }
            tempPos++;
          }
          if (tempPos < this.input.length && this.input[tempPos] === '{') {
            tokens.push(id);
            this.pos = tempPos; this.line = tempLine; this.col = tempCol;
            tokens.push({ type: TokenType.Punctuation, value: '{', line: this.line, col: this.col++ });
            this.pos++;
            
            let content = '';
            let braces = 1;
            const cLine = this.line, cCol = this.col;
            while (this.pos < this.input.length && braces > 0) {
              const c = this.input[this.pos];
              if (c === '{') braces++; else if (c === '}') braces--;
              if (braces === 0) break;
              content += c;
              if (c === '\n') { this.line++; this.col = 1; } else { this.col++; }
              this.pos++;
            }
            tokens.push({ type: TokenType.String, value: content, line: cLine, col: cCol });
            if (this.pos < this.input.length && this.input[this.pos] === '}') {
              tokens.push({ type: TokenType.Punctuation, value: '}', line: this.line, col: this.col++ });
              this.pos++;
            }
            continue;
          }
        }
        tokens.push(id); continue; 
      }
      if (char === '"' || char === "'") { tokens.push(this.readString(char)); continue; }
      if ('+-*/=<>!&|'.includes(char)) { tokens.push(this.readOperator()); continue; }
      if ('(){}[].,:;'.includes(char)) {
        tokens.push({ type: TokenType.Punctuation, value: char, line: this.line, col: this.col++ });
        this.pos++; continue;
      }
      throw new Error(`Недопустимый символ: '${char}' на строке ${this.line}:${this.col}`);
    }
    tokens.push({ type: TokenType.EOF, value: '', line: this.line, col: this.col });
    return tokens;
  }
  private readNumber(): Token {
    let val = ''; const start = this.col;
    while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) { val += this.input[this.pos++]; this.col++; }
    return { type: TokenType.Number, value: val, line: this.line, col: start };
  }
  private readIdentifier(): Token {
    let val = ''; const start = this.col;
    while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) { val += this.input[this.pos++]; this.col++; }
    const type = KEYWORDS.includes(val) ? TokenType.Keyword : TokenType.Identifier;
    return { type, value: val, line: this.line, col: start };
  }
  private readString(q: string): Token {
    let val = ''; const start = this.col; this.pos++; this.col++;
    while (this.pos < this.input.length && this.input[this.pos] !== q) { val += this.input[this.pos++]; this.col++; }
    if (this.pos < this.input.length) { this.pos++; this.col++; }
    return { type: TokenType.String, value: val, line: this.line, col: start };
  }
  private readOperator(): Token {
    let val = this.input[this.pos++]; const start = this.col++;
    const next = this.input[this.pos];
    if ((val === '&' && next === '&') || (val === '|' && next === '|') || (val === '!' && next === '=') || (val === '=' && next === '=') || (val === '<' && next === '=') || (val === '>' && next === '=')) {
      val += this.input[this.pos++]; this.col++;
    }
    return { type: TokenType.Operator, value: val, line: this.line, col: start };
  }
}

// --- PARSER ---
export interface ASTNode {
  type: string;
  line: number;
  col: number;
  [key: string]: any;
}

export class Parser {
  private tokens: Token[]; private pos = 0;
  constructor(tokens: Token[]) { this.tokens = tokens; }
  parse(): ASTNode {
    const body: ASTNode[] = [];
    const firstToken = this.peek();
    while (this.peek().type !== TokenType.EOF) body.push(this.parseStatement());
    return { type: 'Program', body, line: firstToken.line, col: firstToken.col };
  }
  private parseStatement(): ASTNode {
    const t = this.peek();
    if (t.type === TokenType.Keyword) {
      if (t.value === 'luau') return this.parseLuau();
      if (t.value === 'func' || t.value === 'function') return this.parseFunction();
      if (t.value === 'var' || t.value === 'local') return this.parseVariable();
      if (t.value === 'if') return this.parseIf();
      if (t.value === 'while') return this.parseWhile();
      if (t.value === 'for') return this.parseFor();
      if (t.value === 'return') return this.parseReturn();
      if (t.value === 'include') return this.parseInclude();
      if (t.value === 'break') { const tok = this.consume('break'); return { type: 'BreakStatement', line: tok.line, col: tok.col }; }
      if (t.value === 'continue') { const tok = this.consume('continue'); return { type: 'ContinueStatement', line: tok.line, col: tok.col }; }
    }
    return this.parseExprStmt();
  }
  private parseLuau() {
    const startTok = this.consume('luau');
    this.consume('{');
    const contentTok = this.consumeType(TokenType.String);
    this.consume('}');
    return { type: 'LuauBlock', content: contentTok.value, line: startTok.line, col: startTok.col };
  }
  private parseInclude() {
    const startTok = this.consume('include');
    const pathTok = this.consumeType(TokenType.String);
    return { type: 'IncludeStatement', path: pathTok.value, line: startTok.line, col: startTok.col };
  }
  private parseFunction() {
    const startTok = this.peek();
    if (this.peek().value === 'func') this.consume('func');
    else this.consume('function');
    const nameTok = this.consumeType(TokenType.Identifier);
    const name = nameTok.value;
    
    // Parentheses are optional in some contexts but let's keep them required for now as per previous logic, 
    // but allow both { and Luau style blocks.
    if (this.peek().value !== '(') {
        throw new Error(`Ошибка: Пропущены скобки '()' в объявлении функции '${name}' на строке ${this.peek().line}:${this.peek().col}.`);
    }

    this.consume('('); const params: string[] = [];
    while (this.peek().value !== ')') { 
      params.push(this.consumeType(TokenType.Identifier).value); 
      if (this.peek().value === ',') this.consume(','); 
    }
    this.consume(')'); 

    const isLuauStyle = this.peek().value !== '{';
    const body = this.parseBlock(isLuauStyle);
    return { type: 'FunctionDecl', name, params, body, line: startTok.line, col: startTok.col };
    }
  private parseVariable() {
    const startTok = this.peek();
    if (this.peek().value === 'var') this.consume('var');
    else this.consume('local');
    const nameTok = this.consumeType(TokenType.Identifier);
    const name = nameTok.value;
    
    let value: ASTNode | null = null;
    if (this.peek().value === '=') {
      this.consume('='); 
      value = this.parseExpression();
    }
    
    return { type: 'VariableDecl', name, value, line: startTok.line, col: startTok.col };
  }
  private parseIf() {
    const startTok = this.peek();
    this.consume('if'); 
    const test = this.parseExpression(); 
    
    let isLuauStyle = false;
    if (this.peek().value === 'then') {
      this.consume('then');
      isLuauStyle = true;
    }
    
    const cons = this.parseBlock(isLuauStyle);
    let alt; 
    if (this.peek().value === 'elseif') { 
      alt = this.parseElseIf(); 
    } else if (this.peek().value === 'else') { 
      this.consume('else'); 
      if (this.peek().value === 'if') {
        alt = this.parseIf();
      } else {
        const altIsLuau = isLuauStyle && this.peek().value !== '{';
        alt = this.parseBlock(altIsLuau);
      }
    }
    return { type: 'IfStatement', test, consequent: cons, alternate: alt, line: startTok.line, col: startTok.col };
  }
  private parseElseIf() {
    const startTok = this.peek();
    this.consume('elseif');
    const test = this.parseExpression();
    
    let isLuauStyle = false;
    if (this.peek().value === 'then') {
      this.consume('then');
      isLuauStyle = true;
    }
    
    const cons = this.parseBlock(isLuauStyle);
    let alt;
    if (this.peek().value === 'elseif') {
      alt = this.parseElseIf();
    } else if (this.peek().value === 'else') {
      this.consume('else');
      if (this.peek().value === 'if') {
        alt = this.parseIf();
      } else {
        const altIsLuau = isLuauStyle && this.peek().value !== '{';
        alt = this.parseBlock(altIsLuau);
      }
    }
    return { type: 'IfStatement', test, consequent: cons, alternate: alt, line: startTok.line, col: startTok.col };
  }
  private parseWhile() {
    const startTok = this.peek();
    this.consume('while'); 
    const test = this.parseExpression(); 
    
    let isLuauStyle = false;
    if (this.peek().value === 'do') {
      this.consume('do');
      isLuauStyle = true;
    }
    
    const body = this.parseBlock(isLuauStyle);
    return { type: 'WhileStatement', test, body, line: startTok.line, col: startTok.col };
  }
  private parseFor() {
    const startTok = this.peek();
    this.consume('for');
    this.consume('(');
    const init = this.parseStatement();
    this.consume(';');
    const test = this.parseExpression();
    this.consume(';');
    const update = this.parseExpression();
    this.consume(')');
    const body = this.parseBlock();
    return { type: 'ForStatement', init, test, update, body, line: startTok.line, col: startTok.col };
  }
  private parseReturn() { 
    const startTok = this.peek();
    this.consume('return'); 
    const arg = (this.peek().value !== '}' && this.peek().value !== 'end' && this.peek().type !== TokenType.EOF) ? this.parseExpression() : null;
    return { type: 'ReturnStatement', arg, line: startTok.line, col: startTok.col }; 
  }
  private parseBlock(isLuauStyleHint: boolean = false) {
    const startTok = this.peek();
    const body: ASTNode[] = [];
    
    // Auto-detect style: if it starts with '{', it's ALWAYS a brace block.
    // Otherwise, if hint is true, it's a Luau-style block.
    if (this.peek().value === '{') {
      this.consume('{');
      while (this.peek().value !== '}' && this.peek().type !== TokenType.EOF) body.push(this.parseStatement());
      this.consume('}');
    } else if (isLuauStyleHint) {
      while (this.peek().value !== 'end' && this.peek().value !== 'else' && this.peek().value !== 'elseif' && this.peek().type !== TokenType.EOF) {
        body.push(this.parseStatement());
      }
      if (this.peek().value === 'end') {
        this.consume('end');
      }
    } else {
        throw new Error(`Ошибка: Ожидалось начало блока '{' или ключевое слово 'then/do' на строке ${this.peek().line}:${this.peek().col}`);
    }
    return { type: 'Block', body, line: startTok.line, col: startTok.col };
  }
  private parseExprStmt() { 
    const expr = this.parseExpression();
    return { type: 'ExpressionStatement', expression: expr, line: expr.line, col: expr.col }; 
  }
  private parseExpression(): ASTNode {
    let left = this.parseLogicalOr();
    if (this.peek().value === '=') { 
      this.consume('='); 
      const right = this.parseExpression();
      return { type: 'Assignment', left, right, line: left.line, col: left.col }; 
    }
    return left;
  }
  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (this.peek().value === '||' || this.peek().value === 'or') {
      const opTok = this.tokens[this.pos++];
      const right = this.parseLogicalAnd();
      left = { type: 'Binary', left, op: opTok.value, right, line: left.line, col: left.col };
    }
    return left;
  }
  private parseLogicalAnd(): ASTNode {
    let left = this.parseBinary();
    while (this.peek().value === '&&' || this.peek().value === 'and') {
      const opTok = this.tokens[this.pos++];
      const right = this.parseBinary();
      left = { type: 'Binary', left, op: opTok.value, right, line: left.line, col: left.col };
    }
    return left;
  }
  private parseBinary(): ASTNode {
    let left = this.parsePrimary();
    while (this.peek().type === TokenType.Operator && !['&&', '||', 'and', 'or'].includes(this.peek().value)) {
      const opTok = this.consumeType(TokenType.Operator);
      const right = this.parsePrimary();
      left = { type: 'Binary', left, op: opTok.value, right, line: left.line, col: left.col };
    }
    return left;
  }
  private parsePrimary(): ASTNode {
    let node = this.parseUnary();
    while (true) {
      if (this.peek().value === '.') { 
        this.consume('.'); 
        const propTok = this.consumeType(TokenType.Identifier);
        node = { type: 'Member', obj: node, prop: propTok.value, method: false, line: node.line, col: node.col }; 
      }
      else if (this.peek().value === ':') { 
        this.consume(':'); 
        const propTok = this.consumeType(TokenType.Identifier);
        node = { type: 'Member', obj: node, prop: propTok.value, method: true, line: node.line, col: node.col }; 
      }
      else if (this.peek().value === '(') {
        this.consume('('); const args: ASTNode[] = [];
        while (this.peek().value !== ')') { 
          args.push(this.parseExpression()); 
          if (this.peek().value === ',') this.consume(','); 
        }
        this.consume(')'); 
        node = { type: 'Call', callee: node, args, line: node.line, col: node.col };
      } else break;
    }
    return node;
  }
  private parseUnary(): ASTNode {
    if (this.peek().value === '!' || this.peek().value === 'not') {
      const tok = this.tokens[this.pos++];
      const arg = this.parsePrimary();
      return { type: 'Unary', op: tok.value, arg, line: tok.line, col: tok.col };
    }
    return this.parseAtom();
  }
  private parseAtom(): ASTNode {
    const t = this.peek();
    if (t.type === TokenType.Number) {
      const tok = this.consumeType(TokenType.Number);
      return { type: 'Literal', value: Number(tok.value), line: tok.line, col: tok.col };
    }
    if (t.type === TokenType.String) {
      const tok = this.consumeType(TokenType.String);
      return { type: 'Literal', value: tok.value, line: tok.line, col: tok.col };
    }
    if (t.type === TokenType.Keyword) {
      if (t.value === 'true') { const tok = this.consume('true'); return { type: 'Literal', value: true, line: tok.line, col: tok.col }; }
      if (t.value === 'false') { const tok = this.consume('false'); return { type: 'Literal', value: false, line: tok.line, col: tok.col }; }
      if (t.value === 'nil') { const tok = this.consume('nil'); return { type: 'Literal', value: null, line: tok.line, col: tok.col }; }
      if (t.value === 'func' || t.value === 'function') return this.parseFunctionExpr();
    }
    if (t.type === TokenType.Identifier) {
      const tok = this.consumeType(TokenType.Identifier);
      return { type: 'Identifier', name: tok.value, line: tok.line, col: tok.col };
    }
    if (this.peek().value === '(') { 
      this.consume('('); 
      const e = this.parseExpression(); 
      this.consume(')'); 
      return e; 
    }
    throw new Error(`Ошибка: Неожиданный токен '${t.value}' на строке ${t.line}:${t.col}`);
  }
  private parseFunctionExpr(): ASTNode {
    const startTok = this.peek();
    const isRbx = startTok.value === 'func';
    this.consume(startTok.value);
    
    this.consume('(');
    const params: string[] = [];
    while (this.peek().value !== ')') {
      params.push(this.consumeType(TokenType.Identifier).value);
      if (this.peek().value === ',') this.consume(',');
    }
    this.consume(')');

    const body = isRbx ? this.parseBlock() : this.parseLuauBody();
    return { type: 'FunctionExpr', params, body, line: startTok.line, col: startTok.col };
  }
  private parseLuauBody(): ASTNode {
    const body: ASTNode[] = [];
    while (this.peek().value !== 'end' && this.peek().type !== TokenType.EOF) {
        body.push(this.parseStatement());
    }
    this.consume('end');
    return { type: 'Block', body, line: this.peek().line, col: this.peek().col };
  }
  private peek() { return this.tokens[this.pos]; }
  private consume(v: string) { 
    if (this.peek().value !== v) throw new Error(`Ошибка: Ожидалось '${v}', но встречено '${this.peek().value}' на строке ${this.peek().line}:${this.peek().col}`); 
    return this.tokens[this.pos++]; 
  }
  private consumeType(t: TokenType) { 
    if (this.peek().type !== t) throw new Error(`Ошибка: Ожидался тип ${TokenType[t]}, но встречен ${TokenType[this.peek().type]} на строке ${this.peek().line}:${this.peek().col}`); 
    return this.tokens[this.pos++]; 
  }
}

// --- GENERATOR ---
export class Generator {
  private ind = 0;
  generate(n: ASTNode): string {
    if (!n) return '';
    switch (n.type) {
      case 'Program': return n.body.map((s: any) => this.generate(s)).join('\n');
      case 'IncludeStatement': return `-- [Included: ${n.path}]`; // Handle actual inclusion in App.tsx
      case 'FunctionDecl': return `local function ${n.name}(${n.params.join(', ')})\n${this.genBlock(n.body)}end`;
      case 'FunctionExpr': return `function(${n.params.join(', ')})\n${this.genBlock(n.body)}end`;
      case 'VariableDecl': return `local ${n.name}${n.value !== null ? ` = ${this.generate(n.value)}` : ''}`;
      case 'IfStatement': 
        let r = `if ${this.generate(n.test)} then\n${this.genBlock(n.consequent)}`; 
        let curr = n.alternate;
        while (curr && curr.type === 'IfStatement') {
          r += `elseif ${this.generate(curr.test)} then\n${this.genBlock(curr.consequent)}`;
          curr = curr.alternate;
        }
        if (curr) {
          r += `else\n${this.genBlock(curr)}`;
        }
        return r + 'end';
      case 'WhileStatement': return `while ${this.generate(n.test)} do\n${this.genBlock(n.body)}end`;
      case 'ForStatement': 
        const init = this.generate(n.init);
        const test = this.generate(n.test);
        const update = this.generate(n.update);
        return `${init}\nwhile ${test} do\n${this.genBlock(n.body)}  ${update}\nend`;
      case 'ReturnStatement': return `return ${this.generate(n.arg)}`;
      case 'LuauBlock': return n.content;
      case 'BreakStatement': return 'break';
      case 'ContinueStatement': return 'continue';
      case 'ExpressionStatement': return this.generate(n.expression);
      case 'Assignment': return `${this.generate(n.left)} = ${this.generate(n.right)}`;
      case 'Binary': 
        let op = n.op; 
        if (op === '+') {
          if ((n.left.type === 'Literal' && typeof n.left.value === 'string') || 
              (n.right.type === 'Literal' && typeof n.right.value === 'string')) {
            op = '..';
          }
        }
        if (op === '!=') op = '~='; 
        if (op === '&&' || op === 'and') op = 'and';
        if (op === '||' || op === 'or') op = 'or';
        return `${this.generate(n.left)} ${op} ${this.generate(n.right)}`;
      case 'Unary':
        let uop = n.op;
        if (uop === '!' || uop === 'not') uop = 'not ';
        return `${uop}${this.generate(n.arg)}`;
      case 'Member': return `${this.generate(n.obj)}${n.method ? ':' : '.'}${n.prop}`;
      case 'Call': 
        if (n.callee.type === 'Identifier' && n.callee.name === 'listen') return `${this.generate(n.args[0])}:Connect(${this.generate(n.args[1])})`;
        return `${this.generate(n.callee)}(${n.args.map((a: any) => this.generate(a)).join(', ')})`;
      case 'Literal': if (n.value === null) return 'nil'; return typeof n.value === 'string' ? `"${n.value}"` : String(n.value);
      case 'Identifier': return n.name;
      case 'Block': return this.genBlock(n);
      default: return '';
    }
  }
  private genBlock(b: any) { this.ind++; const r = b.body.map((s: any) => '  '.repeat(this.ind) + this.generate(s)).join('\n') + '\n'; this.ind--; return r; }
}

// --- LINTER ---
export interface Fix {
  type: 'REPLACE_TEXT' | 'ADD_TEXT';
  old?: string;
  new: string;
  line?: number;
  col?: number;
}

export interface LinterError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'hint';
  tag?: 'Logic' | 'Syntax' | 'Security';
  fix?: Fix;
}

const ROBLOX_GLOBALS = new Set([
  'game', 'Workspace', 'workspace', 'script', 'print', 'warn', 'error', 'wait', 'tick', 'time',
  'Enum', 'Instance', 'Vector3', 'CFrame', 'Color3', 'UDim2', 'UDim', 'Ray', 'Rect', 'Region3',
  'spawn', 'delay', 'require', 'getmetatable', 'setmetatable', 'type', 'tostring', 'tonumber',
  'math', 'string', 'table', 'bit32', 'task', 'debug', 'utf8', 'os', 'coroutine', 'Players', 
  'ServerStorage', 'ReplicatedStorage', 'HttpService', 'TweenService', 'RunService', 'UserInputService',
  'listen'
]);

function levenshtein(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) { tmp[i] = [i]; }
  for (let j = 0; j <= b.length; j++) { tmp[0][j] = j; }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

export class LogicalAnalyzer {
  private definedFunctions = new Map<string, ASTNode>();
  private calledFunctions = new Set<string>();

  public getDefinedFunctions() {
    return this.definedFunctions;
  }

  analyze(ast: ASTNode, isMain: boolean = false): LinterError[] {
    this.definedFunctions.clear();
    this.calledFunctions.clear();
    const errors: LinterError[] = [];

    this.findFunctionsAndCalls(ast);

    // Dead Code Detection
    this.definedFunctions.forEach((node, name) => {
      if (!this.calledFunctions.has(name) && name !== 'start' && name !== 'onload') {
        errors.push({
          line: node.line,
          col: node.col,
          message: `Мертвый код: Функция '${name}' определена, но никогда не вызывается.`,
          severity: 'warning',
          tag: 'Logic'
        });
      }
    });

    // Missing Entry Call Detection
    if (isMain) {
      const entryPoint = this.definedFunctions.get('start') || this.definedFunctions.get('onload');
      if (entryPoint && !this.calledFunctions.has(entryPoint.name)) {
        errors.push({
          line: entryPoint.line,
          col: entryPoint.col,
          message: `Функция '${entryPoint.name}' определена, но не вызывается. Добавьте вызов в конце файла для запуска скрипта.`,
          severity: 'warning',
          tag: 'Logic',
          fix: {
            type: 'ADD_TEXT',
            new: `\n\n// Автоматический вызов точки входа\n${entryPoint.name}()`,
            line: -1 // Special value for absolute end of file
          }
        });
      }
    }

    return errors;
  }

  private findFunctionsAndCalls(node: ASTNode) {
    if (!node) return;
    
    if (node.type === 'FunctionDecl') {
      this.definedFunctions.set(node.name, node);
    }
    
    if (node.type === 'Call') {
      if (node.callee.type === 'Identifier') {
        this.calledFunctions.add(node.callee.name);
      }
    }

    // Traverse children
    for (const key in node) {
      const val = node[key];
      if (Array.isArray(val)) {
        val.forEach(child => {
          if (child && typeof child === 'object' && child.type) {
            this.findFunctionsAndCalls(child);
          }
        });
      } else if (val && typeof val === 'object' && val.type) {
        this.findFunctionsAndCalls(val);
      }
    }
  }
}

export interface FileEntry {
  name: string;
  path: string;
  content: string;
  isLinked?: boolean;
  isLibrary?: boolean;
  bundleOrder?: number;
}

export class Linter {
  private errors: LinterError[] = [];
  private scopes: Set<string>[] = [];
  private logicalAnalyzer = new LogicalAnalyzer();

  private extractGlobals(node: ASTNode) {
    if (!node) return;
    if (node.type === 'Program' || node.type === 'Block') {
      node.body.forEach((s: ASTNode) => this.extractGlobals(s));
    } else if (node.type === 'FunctionDecl' || node.type === 'VariableDecl') {
      this.declare(node.name);
    }
  }

  lint(code: string, languageMode: 'RbxEasy' | 'Luau' = 'RbxEasy', allFiles: FileEntry[] = [], isMain: boolean = false): LinterError[] {
    this.errors = [];
    this.scopes = [new Set(ROBLOX_GLOBALS)];
    const lines = code.split('\n');

    // BUILD GLOBAL SCOPE FROM OTHER FILES
    const projectFileNames = allFiles.map(f => f.name);
    allFiles.forEach(file => {
      // Only include linked files (libraries or other parts), excluding the current file
      if (file.isLinked && file.content && file.content !== code) {
        try {
          const tokens = new Lexer(file.content).tokenize();
          const parser = new Parser(tokens);
          const ast = parser.parse();
          this.extractGlobals(ast);
        } catch (e) {
          // Silent fail for background files
        }
      }
    });

    if (languageMode === 'RbxEasy') {
      let inLuauBlock = false;
      lines.forEach((lineText, index) => {
        const lineNum = index + 1;
        
        if (lineText.includes('luau {')) inLuauBlock = true;
        if (inLuauBlock) {
          if (lineText.includes('}')) inLuauBlock = false;
          return;
        }

        // Include check
        const includeMatch = lineText.match(/include\s+"([^"]+)"/);
        if (includeMatch) {
            const fileName = includeMatch[1];
            const fullFileName = fileName.endsWith('.rbxe') ? fileName : fileName + '.rbxe';
            if (!projectFileNames.includes(fullFileName)) {
                this.errors.push({
                    line: lineNum,
                    col: lineText.indexOf(fileName),
                    message: `Ошибка: Файл '${fileName}' не найден в проекте. Проверьте правильность имени или создайте этот файл.`,
                    severity: 'error'
                });
            }
        }
        
        if (/\bwait\(/.test(lineText) && !lineText.includes('task.wait(')) this.errors.push({ line: lineNum, col: lineText.indexOf('wait(') + 1, message: "Используйте 'task.wait()' — это стандарт индустрии Roblox.", severity: 'warning', fix: { type: 'REPLACE_TEXT', old: 'wait', new: 'task.wait' } });
        
        // Workspace safe access check
        const workspaceMatch = lineText.match(/\b(Workspace|game\.Workspace)\.([a-zA-Z0-9_]+)\b/);
        if (workspaceMatch && !['WaitForChild', 'FindFirstChild', 'CurrentCamera', 'Terrain'].includes(workspaceMatch[2])) {
          this.errors.push({ 
            line: lineNum, 
            col: lineText.indexOf(workspaceMatch[0]) + 1, 
            message: "Совет: Используйте :WaitForChild(\"" + workspaceMatch[2] + "\") для безопасного доступа к объектам.", 
            severity: 'hint',
            fix: { 
              type: 'REPLACE_TEXT', 
              old: workspaceMatch[0], 
              new: `${workspaceMatch[1]}:WaitForChild("${workspaceMatch[2]}")` 
            }
          });
        }
      });
    } else {
        // Luau Mode checks
        lines.forEach((lineText, index) => {
            const lineNum = index + 1;
            if (lineText.includes('var ')) {
                this.errors.push({
                    line: lineNum,
                    col: lineText.indexOf('var') + 1,
                    message: "Ошибка: Ключевое слово 'var' недоступно в режиме Luau. Используйте 'local'.",
                    severity: 'error',
                    fix: { type: 'REPLACE_TEXT', old: 'var', new: 'local' }
                });
            }
            if (lineText.includes('func ')) {
                this.errors.push({
                    line: lineNum,
                    col: lineText.indexOf('func') + 1,
                    message: "Ошибка: 'func' недоступно в Luau. Используйте 'function'.",
                    severity: 'error',
                    fix: { type: 'REPLACE_TEXT', old: 'func', new: 'function' }
                });
            }
            if (lineText.includes('//')) {
                this.errors.push({
                    line: lineNum,
                    col: lineText.indexOf('//') + 1,
                    message: "В Luau комментарии пишутся через '--'. Замените, чтобы избежать ошибок.",
                    severity: 'warning',
                    fix: { type: 'REPLACE_TEXT', old: '//', new: '--' }
                });
            }
        });
    }

    try {
      const tokens = new Lexer(code).tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();
      this.analyze(ast);
      
      // RUN LOGICAL ANALYSIS
      const logicalErrors = this.logicalAnalyzer.analyze(ast, isMain);
      this.errors.push(...logicalErrors);
    } catch (e: any) {
      const lineMatch = e.message.match(/на строке (\d+)(?::(\d+))?/);
      const line = lineMatch ? parseInt(lineMatch[1]) : lines.length;
      const col = (lineMatch && lineMatch[2]) ? parseInt(lineMatch[2]) : 1;
      
      let fix: Fix | undefined = undefined;
      if (e.message.includes("Ожидалось '{'")) {
        fix = { type: 'ADD_TEXT', new: ' {', line, col: 100 };
      }

      if (!this.errors.some(err => err.line === line && err.severity === 'error')) {
        this.errors.push({ line, col, message: e.message, severity: 'error', fix });
      }
    }

    return this.errors;
  }

  private analyze(node: ASTNode) {
    if (!node) return;
    switch (node.type) {
      case 'Program':
      case 'Block':
        this.enterScope();
        node.body.forEach((s: ASTNode) => this.analyze(s));
        this.exitScope();
        break;
      case 'IncludeStatement':
        // Path analysis could go here if needed
        break;
      case 'FunctionDecl':
        if (this.isDeclared(node.name)) {
          this.errors.push({ line: node.line, col: node.col, message: `Ошибка: Функция '${node.name}' уже существует в этой области видимости.`, severity: 'error' });
        }
        this.declare(node.name);
        this.enterScope();
        node.params.forEach((p: string) => this.declare(p));
        this.analyze(node.body);
        this.exitScope();
        break;
      case 'FunctionExpr':
        this.enterScope();
        node.params.forEach((p: string) => this.declare(p));
        this.analyze(node.body);
        this.exitScope();
        break;
      case 'VariableDecl':
        if (this.isDeclaredInCurrentScope(node.name)) {
          this.errors.push({ line: node.line, col: node.col, message: `Ошибка: Переменная '${node.name}' уже объявлена выше.`, severity: 'error' });
        }
        this.declare(node.name);
        this.analyze(node.value);
        break;
      case 'Assignment':
        this.analyze(node.left);
        this.analyze(node.right);
        break;
      case 'Binary':
        this.analyze(node.left);
        this.analyze(node.right);
        if (node.op === '+' && 
           ((node.left.type === 'Literal' && typeof node.left.value === 'string' && typeof node.right.value === 'number') ||
            (node.right.type === 'Literal' && typeof node.right.value === 'string' && typeof node.left.value === 'number'))) {
          this.errors.push({ line: node.line, col: node.col, message: "Внимание: Попытка сложения строки и числа. В Lua/RbxEasy для этого используется оператор '..' или автоматическое приведение.", severity: 'warning' });
        }
        break;
      case 'Call':
        this.analyze(node.callee);
        node.args.forEach((a: ASTNode) => this.analyze(a));
        break;
      case 'Identifier':
        if (!this.isDeclared(node.name)) {
          const suggestion = this.findSuggestion(node.name);
          this.errors.push({ 
            line: node.line, 
            col: node.col, 
            message: `Ошибка: Идентификатор '${node.name}' не найден. ${suggestion ? `Может быть, вы имели в виду '${suggestion}'?` : 'Проверьте написание.'}`, 
            severity: 'error',
            fix: suggestion ? { type: 'REPLACE_TEXT', old: node.name, new: suggestion } : undefined
          });
        }
        break;
      case 'Member':
        this.analyze(node.obj);
        break;
      case 'IfStatement':
        this.analyze(node.test);
        this.analyze(node.consequent);
        if (node.alternate) this.analyze(node.alternate);
        break;
      case 'WhileStatement':
        this.analyze(node.test);
        this.analyze(node.body);
        break;
      case 'ForStatement':
        this.enterScope();
        this.analyze(node.init);
        this.analyze(node.test);
        this.analyze(node.update);
        this.analyze(node.body);
        this.exitScope();
        break;
      case 'ReturnStatement':
        if (node.arg) this.analyze(node.arg);
        break;
      case 'ExpressionStatement':
        if (node.expression.type === 'Identifier') {
          const name = node.expression.name;
          this.errors.push({
            line: node.line,
            col: node.col,
            message: `Ошибка: Использование имени '${name}' как инструкции не имеет смысла. Скорее всего, вы забыли скобки '()' для вызова функции.`,
            severity: 'error',
            fix: { type: 'REPLACE_TEXT', old: name, new: `${name}()` }
          });
        }
        this.analyze(node.expression);
        break;
    }
  }

  private findSuggestion(name: string): string | null {
    let bestMatch: string | null = null;
    let minDistance = 3; 

    for (let i = this.scopes.length - 1; i >= 0; i--) {
      for (const declared of this.scopes[i]) {
        const dist = levenshtein(name, declared);
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = declared;
        }
      }
    }
    return bestMatch;
  }

  private enterScope() { this.scopes.push(new Set()); }
  private exitScope() { this.scopes.pop(); }
  private declare(name: string) { this.scopes[this.scopes.length - 1].add(name); }
  private isDeclared(name: string): boolean {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return true;
    }
    return false;
  }
  private isDeclaredInCurrentScope(name: string): boolean {
    return this.scopes[this.scopes.length - 1].has(name);
  }
}

