export interface DocumentRecord {
    id: string;
    content: string;
    metadata: Record<string, any>;
    timestamp: number;
}

export interface TableRecord {
    name: string;
    schema: Record<string, string>;
    data: any[];
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

/**
 * ExternalMemory stores docs/tables/chat history in-memory.
 * Replace with a real store/vector DB for production.
 */
export class ExternalMemory {
    private documents: Map<string, DocumentRecord> = new Map();
    private tables: Map<string, TableRecord> = new Map();
    private chatHistory: ChatMessage[] = [];
    private maxChatHistory = 100;

    /**
     * Seed concise, language-agnostic reference docs for common programming languages.
     * This expands retrieval knowledge without altering any UI/functional flows.
     */
    async seedLanguageDocs(): Promise<void> {
        // If already seeded, skip
        if (this.documents.size > 0) return;

        const now = Date.now();
        const docs: DocumentRecord[] = [
            {
                id: 'lang-js-ts',
                content: [
                    'JavaScript/TypeScript basics:',
                    '- Common errors: Unexpected token (syntax), Cannot read property of undefined (null/undefined access), Module not found (path/package).',
                    '- Fixes: Check brackets/parentheses, null-check with optional chaining (?.), verify import paths and installed packages.',
                    '- Async: await only inside async functions; handle Promise rejections with try/catch.',
                    '- Types (TS): use interfaces/types; avoid any; strict null checks; watch for implicit any.',
                    '',
                    'JavaScript/TypeScript error patterns:',
                    '- SyntaxError / "Unexpected token": missing/extra bracket, comma, semicolon, or mismatched JSX/TS syntax.',
                    '- ReferenceError / "is not defined": missing import/variable, wrong scope.',
                    '- TypeError / "Cannot read property of undefined/null": null/undefined access—add guards or optional chaining.',
                    '- Module not found / Cannot find module: bad import path or dependency not installed; run npm/yarn/pnpm install.',
                    '- TS2307 Cannot find module: path/typing missing; add @types or correct path.',
                    '- TS2339 Property does not exist: check types/interfaces, narrow with guards, avoid any.',
                    '- TS7006 Parameter implicitly has an any type: add explicit type annotations or enable noImplicitAny handling.'
                ].join('\n'),
                metadata: { title: 'JavaScript/TypeScript Quick Guide', tags: ['language', 'javascript', 'typescript'] },
                timestamp: now
            },
            {
                id: 'lang-python',
                content: [
                    'Python basics:',
                    '- Common errors: IndentationError, ModuleNotFoundError, AttributeError, TypeError (NoneType).',
                    '- Fixes: Check indent (4 spaces), verify venv and pip install, guard None values, match function signatures.',
                    '- Virtual env: python -m venv .venv && source .venv/bin/activate (or Scripts on Windows); pip install -r requirements.txt.',
                    '',
                    'Python error patterns:',
                    '- IndentationError: mixed tabs/spaces or bad block indent.',
                    '- ModuleNotFoundError/ImportError: missing package or wrong module name; activate venv and pip install.',
                    '- AttributeError / NoneType has no attribute: object is None—add None checks.',
                    '- TypeError: wrong arg count or wrong type—match function signature.',
                    '- NameError: variable not defined in scope—ensure assignment/import.',
                    '- SyntaxError: check colons, parentheses, quotes, f-string braces.'
                ].join('\n'),
                metadata: { title: 'Python Quick Guide', tags: ['language', 'python'] },
                timestamp: now
            },
            {
                id: 'lang-java',
                content: [
                    'Java basics:',
                    '- Common errors: Cannot find symbol (import/spelling), ClassNotFoundException (classpath), NullPointerException.',
                    '- Fixes: Verify package/imports, build with correct classpath/Gradle/Maven, null-checks and Optional.',
                    '- Build: mvn clean install or gradle build; ensure JDK version matches project.',
                    '',
                    'Java error patterns:',
                    '- Cannot find symbol: wrong import/package/spelling; check case-sensitive names.',
                    '- ClassNotFoundException/NoClassDefFoundError: missing dependency or classpath; add to pom.xml/build.gradle, rebuild.',
                    '- NullPointerException: uninitialized fields, missing null checks.',
                    '- NoSuchMethodError/NoSuchFieldError: version mismatch between compile/runtime deps; align dependency versions.',
                    '- Incompatible types: generics mismatch; add casts with care or adjust type parameters.'
                ].join('\n'),
                metadata: { title: 'Java Quick Guide', tags: ['language', 'java'] },
                timestamp: now
            },
            {
                id: 'lang-csharp',
                content: [
                    'C# basics:',
                    '- Common errors: CS0103 name does not exist, CS0246 type/namespace not found, NullReferenceException.',
                    '- Fixes: Add using/imports, check project references/nuget restore, add null checks.',
                    '- Build: dotnet restore; dotnet build; match target framework.',
                    '',
                    'C# error patterns:',
                    '- CS0103 name does not exist: missing using or wrong scope.',
                    '- CS0246 type/namespace not found: add reference/nuget, check target framework.',
                    '- CS0117 does not contain a definition: wrong type or missing extension method.',
                    '- NullReferenceException: uninitialized refs; use null-forgiving cautiously, prefer null checks/?.',
                    '- Assembly binding/version errors: align package versions, clear bin/obj and rebuild.'
                ].join('\n'),
                metadata: { title: 'C# Quick Guide', tags: ['language', 'csharp'] },
                timestamp: now
            },
            {
                id: 'lang-go',
                content: [
                    'Go basics:',
                    '- Common errors: undefined (missing import or unused), cannot use type X as Y, module not found.',
                    '- Fixes: go mod tidy; ensure package name matches folder; handle returned err; use pointers vs values correctly.',
                    '',
                    'Go error patterns:',
                    '- undefined: missing import, misspelled identifier, or unused import removed; check package name.',
                    '- cannot use X as Y: type mismatch; add conversion or adjust interface/struct.',
                    '- module not found: run go mod tidy; check replace directives.',
                    '- import cycle not allowed: refactor packages to break cycles.',
                    '- panic: nil deref or out-of-range; add nil/range checks.'
                ].join('\n'),
                metadata: { title: 'Go Quick Guide', tags: ['language', 'go'] },
                timestamp: now
            },
            {
                id: 'lang-rust',
                content: [
                    'Rust basics:',
                    '- Common errors: borrow checker (mutable/immutable), lifetime mismatches, trait not implemented.',
                    '- Fixes: clone when needed (costly), restructure ownership, add trait bounds/impls, use refs & borrowing.',
                    '',
                    'Rust error patterns:',
                    '- cannot borrow as mutable/immutable: adjust mutability or cloning; respect one mutable or many immutable borrows.',
                    '- value moved / use of moved value: clone or restructure ownership.',
                    '- lifetime errors: add explicit lifetimes or adjust data flow to shorten borrows.',
                    '- trait not implemented: add impl or bring trait into scope (use).',
                    '- expected struct X, found enum/other: check Result/Option unwraps.'
                ].join('\n'),
                metadata: { title: 'Rust Quick Guide', tags: ['language', 'rust'] },
                timestamp: now
            },
            {
                id: 'lang-c-cpp',
                content: [
                    'C/C++ basics:',
                    '- Common errors: undefined reference (linker), redefinition, missing include, segmentation fault.',
                    '- Fixes: Add headers, link required libs, guard header with #pragma once or include guards, check pointers and lifetimes.',
                    '',
                    'C/C++ error patterns:',
                    '- undefined reference: missing library/object in linker; add to linker flags.',
                    '- redefinition/conflicting types: duplicate includes without guards; add include guards/#pragma once.',
                    '- missing include: add header for symbol; match prototypes.',
                    '- segmentation fault: bad pointers/out-of-bounds; add checks, initialize pointers.',
                    '- ABI/version mismatch: rebuild all with same compiler/settings.'
                ].join('\n'),
                metadata: { title: 'C/C++ Quick Guide', tags: ['language', 'c', 'cpp'] },
                timestamp: now
            },
            {
                id: 'lang-php',
                content: [
                    'PHP basics:',
                    '- Common errors: undefined variable/index, class not found, syntax error near unexpected token.',
                    '- Fixes: Initialize vars, autoload/composer dump-autoload, check semicolons/braces, enable error reporting in dev.',
                    '',
                    'PHP error patterns:',
                    '- Undefined variable/index: initialize or isset/?? checks.',
                    '- Class not found: composer install/dump-autoload; correct namespace/use.',
                    '- Parse error/unexpected T_: missing semicolon/brace/quote.',
                    '- Call to member function on null: null checks before method access.'
                ].join('\n'),
                metadata: { title: 'PHP Quick Guide', tags: ['language', 'php'] },
                timestamp: now
            },
            {
                id: 'lang-ruby',
                content: [
                    'Ruby basics:',
                    '- Common errors: NameError constant not initialized, NoMethodError nil, LoadError cannot load such file.',
                    '- Fixes: Require needed files/gems, check nil, bundle install, match class/module names and file paths.',
                    '',
                    'Ruby error patterns:',
                    '- NameError/Uninitialized constant: require files, check module/class names and paths.',
                    '- NoMethodError for nil: add nil checks; ensure object is initialized.',
                    '- LoadError cannot load such file: bundle install; check load path/require_relative.'
                ].join('\n'),
                metadata: { title: 'Ruby Quick Guide', tags: ['language', 'ruby'] },
                timestamp: now
            },
            {
                id: 'lang-swift-kotlin',
                content: [
                    'Swift/Kotlin basics:',
                    '- Common errors: optionals/NullPointer, unresolved identifier/symbol, type mismatch.',
                    '- Fixes: Unwrap safely (if let/guard or ?. ?:), add imports/deps, match nullability and types.',
                    '',
                    'Swift/Kotlin error patterns:',
                    '- Optional/NullPointer errors: unwrap safely (if let/guard, ?. ?:).',
                    '- Unresolved identifier/symbol: add import/dependency; check module names.',
                    '- Type mismatch: align nullability and generics; add explicit types.',
                    '- Missing return/when branches (Kotlin): cover all sealed cases or add else.'
                ].join('\n'),
                metadata: { title: 'Swift & Kotlin Quick Guide', tags: ['language', 'swift', 'kotlin'] },
                timestamp: now
            },
            {
                id: 'lang-sql',
                content: [
                    'SQL basics:',
                    '- Common errors: syntax near token, ambiguous column, table/column not found.',
                    '- Fixes: Qualify columns with table/alias, check join keys, verify schema and migrations, use LIMIT for safety.',
                    '',
                    'SQL error patterns:',
                    '- Syntax error near token: check commas, quotes, parentheses; DB-specific keywords.',
                    '- Ambiguous column: qualify with table/alias.',
                    '- Table/column not found: check schema/migrations, case, current DB.',
                    '- Join errors / cartesian results: ensure correct join keys and ON clauses.'
                ].join('\n'),
                metadata: { title: 'SQL Quick Guide', tags: ['language', 'sql'] },
                timestamp: now
            },
            {
                id: 'errors-all-patterns',
                content: [
                    'Error categories and patterns (cross-language):',
                    '',
                    'Syntax errors (high):',
                    '- Patterns: SyntaxError, unexpected token, missing semicolon, unexpected end of file, invalid syntax, expected ... but found ...',
                    '- Causes: Missing/extra brackets/parentheses/quotes/commas/semicolons; incomplete statements.',
                    '- Fix: Balance delimiters, complete statements, check nearby tokens.',
                    '',
                    'Type errors (high):',
                    '- Patterns: TypeError, cannot read property/of undefined/null, is not a function/constructor, is not defined.',
                    '- Causes: Null/undefined access; wrong type; missing import; wrong call signature.',
                    '- Fix: Add null checks/optional chaining; verify imports; match function signatures.',
                    '',
                    'Import/Module errors (medium):',
                    '- Patterns: ModuleNotFoundError, module not found, Cannot find module, import failed, cannot resolve.',
                    '- Causes: Missing dependency; bad path/name; install not run.',
                    '- Fix: Install deps; fix import paths/names; rebuild.',
                    '',
                    'Runtime/Reference errors (high):',
                    '- Patterns: ReferenceError, RangeError, cannot access before initialization, stack overflow/maximum call stack.',
                    '- Causes: Wrong scope/hoisting; infinite recursion; out-of-bounds.',
                    '- Fix: Check variable scope/order; guard recursion/loops; validate indices.',
                    '',
                    'Dependency/version errors (medium):',
                    '- Patterns: peer dependency/version conflict/not found; npm/pip/go mod errors.',
                    '- Causes: Version mismatch; lock-file drift; missing peer deps.',
                    '- Fix: Align versions; reinstall; update lock; tidy modules.',
                    '',
                    'Configuration errors (medium):',
                    '- Patterns: config not found/invalid/missing env.',
                    '- Causes: Missing config file/ENV; bad path/format.',
                    '- Fix: Provide config/env; validate format; correct paths.',
                    '',
                    'Network errors (medium):',
                    '- Patterns: ECONNREFUSED, ETIMEDOUT, failed to fetch, connection reset/refused, timeout.',
                    '- Causes: Service down; wrong URL/port; firewall; connectivity.',
                    '- Fix: Verify service up and URL/port; check network/firewall.',
                    '',
                    'Permission errors (high):',
                    '- Patterns: EACCES, permission denied, unauthorized, forbidden, read-only.',
                    '- Causes: Insufficient permissions; locked/read-only files.',
                    '- Fix: Adjust permissions/user; unlock/change location.',
                    '',
                    'Memory errors (critical):',
                    '- Patterns: out of memory, heap overflow, allocation failed.',
                    '- Causes: Leaks; huge data; unbounded loops; insufficient memory.',
                    '- Fix: Reduce data; fix leaks; optimize; raise limits cautiously.',
                    '',
                    'Other/generic (medium):',
                    '- Patterns: error/exception/failed/cannot/undefined/null/traceback/stack trace.',
                    '- Use full message + stack/context to classify.',
                ].join('\n'),
                metadata: { title: 'Error Categories & Patterns', tags: ['errors', 'patterns'] },
                timestamp: now
            }
        ];

        docs.forEach(doc => this.documents.set(doc.id, doc));
    }

    async getDocuments(_query: string, topK: number): Promise<DocumentRecord[]> {
        const all = Array.from(this.documents.values());
        return all.slice(0, topK);
    }

    async getTables(_query: string): Promise<TableRecord[]> {
        return Array.from(this.tables.values());
    }

    async getChatHistory(limit: number): Promise<ChatMessage[]> {
        return this.chatHistory.slice(-limit);
    }

    async storeDocument(doc: DocumentRecord): Promise<void> {
        this.documents.set(doc.id, doc);
    }

    async storeChatMessage(message: ChatMessage): Promise<void> {
        this.chatHistory.push(message);
        if (this.chatHistory.length > this.maxChatHistory) {
            this.chatHistory.shift();
        }
    }

    async clearChatHistory(): Promise<void> {
        this.chatHistory = [];
    }
}

