from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
import re
import logging
import json

model_name = "deepseek-ai/deepseek-coder-1.3b-instruct"

try:
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float32,
        device_map="auto"
    )
except Exception as e:
    raise RuntimeError(f"\nError loading model : {e}")

def generate_code(context: str, language: str = "python") -> str:
    if not context or not isinstance(context, str):
        return "\nError: Invalid input context. Empty text given."

    try:
        prompt = (
        f"Generate valid and complete {language} code based on the following request.\n"
        f"Only return valid {language} code with no explanations or comments.\n"
        f"Request is :\n{context}\n"
        )

        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        outputs = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.2,
            top_p=0.7,
            do_sample=True
        )

        generated = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print("Raw generated output:\n", generated)

        match = re.search(r"```(?:\w+)?\n(.+?)```", generated, re.DOTALL)
        if match:
            extracted_code = match.group(1).strip()
            print("Extracted code block:\n", extracted_code)
            return extracted_code
        else:
            print("No fenced code block found. Returning full output.\n")
            return generated.strip()

    except Exception as e:
        print("Error during code generation:", str(e))
        return f"\nError during code generation: {str(e)}"
    
def extract_json_object(text: str):
    """
    Finds and extracts the first complete JSON object from a string by balancing braces.
    """
    start_index = text.find('{')
    if start_index == -1:
        logging.warning("No starting '{' found in the text.")
        return None

    text_slice = text[start_index:]
    open_braces = 0
    
    for i, char in enumerate(text_slice):
        if char == '{':
            open_braces += 1
        elif char == '}':
            open_braces -= 1
        
        if open_braces == 0:
            json_string = text_slice[:i+1]
            try:
                return json.loads(json_string)
            except json.JSONDecodeError as e:
                logging.warning(f"JSONDecodeError: {e} - Attempting to find another JSON object.")
                return extract_json_object(text_slice[i+1:])
    logging.warning("JSON object not balanced or complete within the text.")
    return None


