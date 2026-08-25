import './PromptBox.css';

export default function PromptBox({
  prompt,
  onPromptChange,
  onSubmit,
  disabled = false,
}) {
  function handleSubmit(event) {
    event.preventDefault();

    const cleanedPrompt = prompt.trim();

    if (!cleanedPrompt || disabled) return;

    onSubmit(cleanedPrompt);
  }

  return (
    <form className="prompt-box" onSubmit={handleSubmit}>
      <label className="prompt-box__label" htmlFor="agent-prompt">
        What should the agent do?
      </label>

      <textarea
        id="agent-prompt"
        className="prompt-box__input"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="Example: Find the application form and help me fill it"
        rows="3"
        disabled={disabled}
      />

      <button
        className="prompt-box__submit"
        type="submit"
        disabled={disabled || !prompt.trim()}
      >
        Start Task
      </button>
    </form>
  );
}