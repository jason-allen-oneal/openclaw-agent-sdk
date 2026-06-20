export interface MockResponse {
    role: "assistant";
    content: MockContent[];
}
export type MockContent = {
    type: "text";
    text: string;
} | {
    type: "toolCall";
    name: string;
    input: Record<string, unknown>;
};
export interface MockModelConfig {
    responses: MockResponse[];
}
/** Mock model: returns canned responses. No network. No real LLM. */
export declare class MockModel {
    private responses;
    private index;
    constructor(config: MockModelConfig);
    nextResponse(): MockResponse | null;
    hasMore(): boolean;
    reset(): void;
}
export interface MockToolConfig {
    allow?: boolean;
    result?: unknown;
    error?: string;
}
export interface ToolCallRecord {
    name: string;
    input: Record<string, unknown>;
    blocked: boolean;
    result?: unknown;
    error?: string;
}
export declare const REQUIRED_V1_PROOF_IDS: readonly ["agent.manifest.valid", "agent.integrity.valid", "agent.integrity.mismatchFailsClosed", "agent.installedState.valid", "agent.installedState.driftQuarantines", "agent.instructionFile.driftQuarantines", "agent.mutableInstructionFile.deniedByPolicy", "agent.requiredTool.missingFailsClosed", "agent.requiredPlugin.missingFailsClosed", "agent.requiredSecret.missingFailsClosed", "agent.secretScope.enforced", "agent.deniedTool.blocked", "agent.externalContentToExec.blocked", "agent.outbound.requiresApproval", "agent.workspaceEscape.blocked", "agent.schedule.disabledByDefault", "agent.privateNetwork.blocked", "agent.dnsRebinding.blocked", "agent.sandbox.required", "agent.configCompiler.dryRunValidates", "agent.upgrade.permissionExpansionRequiresApproval"];
export type RequiredV1ProofId = (typeof REQUIRED_V1_PROOF_IDS)[number];
export interface BehaviorProofRecord {
    id: RequiredV1ProofId;
    passed: boolean;
    evidence: string;
}
export interface BehaviorProofSummary {
    passed: boolean;
    proofs: BehaviorProofRecord[];
}
/** Mock tool dispatcher: records invocations, returns configured results. */
export declare class MockTools {
    private config;
    private calls;
    constructor(config: Record<string, MockToolConfig>);
    dispatch(name: string, input: Record<string, unknown>): unknown;
    getCalls(): ToolCallRecord[];
    getCallsFor(name: string): ToolCallRecord[];
    wasCalled(name: string): boolean;
    hadBlockedCall(): boolean;
    reset(): void;
}
export declare function runBehaviorProofs(packagePath: string): Promise<BehaviorProofSummary>;
export declare function formatBehaviorProofSummary(summary: BehaviorProofSummary): string;
export interface HarnessConfig {
    manifestPath: string;
    mockModel: MockModelConfig;
    mockTools: Record<string, MockToolConfig>;
}
export interface HarnessResult {
    toolCalls: ToolCallRecord[];
    blocked: boolean;
    transcript: MockResponse[];
}
/** Test harness: mock model + mock tools. Deterministic behavior proofs. */
export declare class AgentTestHarness {
    private model;
    private tools;
    private transcript;
    constructor(config: HarnessConfig);
    run(): Promise<HarnessResult>;
    getModel(): MockModel;
    getTools(): MockTools;
    reset(): void;
}
//# sourceMappingURL=test.d.ts.map