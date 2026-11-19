# Tagalog voice (MMS)

Meta's MMS text-to-speech model for Tagalog, `facebook/mms-tts-tgl` (https://huggingface.co/facebook/mms-tts-tgl),
licence CC BY-NC 4.0 (non-commercial use, with credit: "MMS: Scaling Speech Technology to 1000+ Languages",
Pratap et al., Meta AI, 2023). Converted to ONNX for sherpa-onnx (same layout as sherpa-onnx's vits-mms models; the
export matches the original model's output exactly, correlation 1.0000 with no noise).

- `tokens.txt` (in git): the characters it reads.
- `model.onnx` (114 MB, NOT in git): the PC link serves it to the phone once (Settings > Voice > Tagalog voice > Download).
