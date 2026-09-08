import { validateAgentActions } from "./actionValidator.js";

const SEND_WORDS = ["send", "post", "publish", "reply", "email", "dm"];
const NEGATE_WORDS = ["do not send", "don't send", "without sending", "just draft"];

const SEND_PURPOSE_REGEX = /^(?:send|post|publish|reply)$/i;

export function enforceCommunicationContinuation({ prompt, history, plan, domContext }) {
  if (!plan || typeof plan !== "object") return plan;

  const promptLower = (prompt || "").toLowerCase();
  
  // 1. Explicitly requests sending
  const hasSendIntent = SEND_WORDS.some(word => promptLower.includes(word));
  if (!hasSendIntent) return plan;

  // 2. Reject negated requests
  const isNegated = NEGATE_WORDS.some(word => promptLower.includes(word));
  if (isNegated) return plan;

  // 3. History has type action with message_composed effect
  if (!Array.isArray(history)) return plan;
  const hasMessageComposed = history.some(
    h => h.type === "type" && h.effect === "message_composed"
  );
  if (!hasMessageComposed) return plan;

  // 4. Fresh DOM contains a contenteditable/message composer with hasContent: true
  if (!Array.isArray(domContext)) return plan;
  
  // We check if there's any element with hasContent: true (often a contenteditable)
  const composerHasContent = domContext.some(el => el.hasContent === true);
  if (!composerHasContent) return plan;

  // 5. Fresh DOM contains exactly one control whose purpose is send/post/publish/reply
  const sendControls = domContext.filter(el => 
    el.purpose && SEND_PURPOSE_REGEX.test(el.purpose)
  );
  
  if (sendControls.length !== 1) return plan;

  const targetSendControl = sendControls[0];
  if (!targetSendControl.targetId) return plan;
  
  // 6. Return the new plan
  const newPlan = {
    message: "Message drafted. Confirmation is required before sending.",
    taskComplete: false,
    actions: [{
      type: "click",
      targetId: targetSendControl.targetId,
      requiresConfirmation: true
    }]
  };

  try {
    const validatedActions = validateAgentActions(newPlan.actions);
    newPlan.actions = validatedActions;
    return newPlan;
  } catch (error) {
    // If validation fails, fallback to original plan
    return plan;
  }
}
