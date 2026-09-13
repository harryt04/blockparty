/**
 * The wordmark and the signature mark: a sawhorse street barricade, the object
 * that closes a street for a party. See DS-001.
 *
 * Blockparty is a PROVISIONAL, UNCLEARED name with Civora as the fallback.
 * A name change must re-skin this component and nothing else, so no other
 * module hard-codes the product name.
 */
export const PRODUCT_NAME = "Blockparty";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <svg
        viewBox="0 0 32 24"
        className="inline-block size-6 align-text-bottom"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        {/* Sawhorse barricade: two legs, a rail, and a diagonal brace. */}
        <path d="M4 20 L9 6 M28 20 L23 6" />
        <path d="M2 11 H30" />
        <path d="M6 16 H26" />
      </svg>
      <span className="ml-2 font-serif text-lg font-semibold">{PRODUCT_NAME}</span>
    </span>
  );
}
