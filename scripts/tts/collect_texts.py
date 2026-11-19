#!/usr/bin/env python3
"""
collect_texts.py — 扫描 output/ 下所有 quizzes，抽取需要 TTS 的文本，
按内容寻址（sha1）去重，输出 manifest.json 给 batch_tts.py 消费。

每条文本会被分配一个 profile（speaker / instruction / language），
profile 取自首次出现该文本的 (subject, grade) 组合。

输出:
  scripts/tts/manifest.json
  {
    "generated_at": "...",
    "total_unique": N,
    "items": [
      { "hash": "...", "text": "...", "audio_rel": "ab/abcd...opus",
        "language": "Chinese", "speaker": "Cherry",
        "instruction": "..." , "field": "question",
        "subject": "math", "grade": 1 }
    ]
  }
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from math_speech import math_speech
from pinyin_speech import pinyin_speech, identity as pinyin_identity, audio_rel as pinyin_audio_rel, CONTEXT as PINYIN_CONTEXT

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "output"
PASSAGES_DIR = ROOT / "data" / "passages"
BUNDLED_PASSAGES_DIR = ROOT / "content" / "passages"
STORIES_DIR = ROOT / "data" / "stories"
MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"

# ---------------------------------------------------------------------------
# 文件名 → 年级
# ---------------------------------------------------------------------------
GRADE_RE = re.compile(r"([一二三四五六])年级(上|下)册")
GRADE_MAP = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}


def parse_grade(filename: str) -> int | None:
    m = GRADE_RE.search(filename)
    return GRADE_MAP[m.group(1)] if m else (int(n.group(1)) if (n := re.search(r"(?:^|-)g([1-6])(?:up|down)(?:-|$)", filename)) else None)


# ---------------------------------------------------------------------------
# 语言判定：若文本主要由 ASCII 字母组成且不含中文 → English
# ---------------------------------------------------------------------------
HAN_RE = re.compile(r"[\u4e00-\u9fff]")
LATIN_RE = re.compile(r"[A-Za-z]")


def detect_language(text: str, subject: str, grade: int | None = None) -> str:
    if subject == "chinese" and grade in (None, 1) and pinyin_speech(text) is not None:
        return "Chinese"
    if HAN_RE.search(text):
        return "Chinese"
    if LATIN_RE.search(text):
        return "English"
    # 纯数字 / 符号 → 跟随学科默认
    return "English" if subject == "english" else "Chinese"


# ---------------------------------------------------------------------------
# Profile：按学科 + 年级 + 语言，挑选 speaker + instruction
# ---------------------------------------------------------------------------
# Qwen3-TTS-CustomVoice 实际支持的 speakers:
#   aiden / dylan / ryan / eric / uncle_fu  — 男声
#   vivian / serena / sohee / ono_anna      — 女声
# 我们按学科 + 年龄段做组合，让小朋友听起来不会单调。

LOW_GRADE = {1, 2}      # 偏幼，慢、活泼、夸张
MID_GRADE = {3, 4}      # 亲切、有节奏
HIGH_GRADE = {5, 6}     # 自然、清晰、稍快


def pick_profile(subject: str, grade: int, language: str) -> tuple[str, str]:
    """返回 (speaker, instruction)"""

    # ---- 英语 ----
    if language == "English":
        if grade in LOW_GRADE:
            return (
                "sohee",
                "Read slowly and clearly with a warm, cheerful tone, like a kind kindergarten "
                "English teacher speaking to a 6-year-old. Pronounce every syllable carefully.",
            )
        if grade in MID_GRADE:
            return (
                "ryan",
                "Read in a friendly and natural American English voice at a moderate pace, "
                "like an elementary school English teacher reading aloud to children.",
            )
        return (
            "dylan",
            "Read in a clear, natural American English voice at a normal pace, "
            "with confident pronunciation, suitable for upper-elementary school students.",
        )

    # ---- 数学 ----
    if subject == "math":
        if grade in LOW_GRADE:
            return (
                "vivian",
                "用温柔耐心的语气，语速很慢，像幼儿园数学老师跟一年级小朋友讲题，"
                "数字一个一个念清楚，遇到加减乘除稍微停顿一下，让小朋友能跟上。",
            )
        if grade in MID_GRADE:
            return (
                "vivian",
                "用亲切活泼的语气，语速适中，像小学数学老师讲题，"
                "重点的数字和运算符读得清晰有节奏。",
            )
        return (
            "serena",
            "用清晰自然的语气，语速正常，像高年级数学老师在讲解，"
            "条理清楚，重点突出。",
        )

    # ---- 语文 ----
    if subject == "chinese":
        if grade in LOW_GRADE:
            return (
                "vivian",
                "用甜美温柔的语气，语速很慢，像幼儿园语文老师朗读绘本，"
                "感情饱满，每个字都念得清清楚楚，让一年级小朋友听得懂。",
            )
        if grade in MID_GRADE:
            return (
                "vivian",
                "用富有感情的朗读语气，语速适中，像小学语文老师范读课文，"
                "抑扬顿挫，让中年级小朋友感受到语言的美。",
            )
        return (
            "serena",
            "用标准的朗读腔，语速自然，像高年级语文老师朗读经典段落，"
            "情感饱满，节奏分明。",
        )

    # ---- 科学 ----
    if subject == "science":
        if grade in LOW_GRADE:
            return (
                "vivian",
                "用充满好奇和兴奋的语气，语速稍慢，像在跟小朋友讲有趣的科学发现，"
                "让一二年级的孩子觉得探索世界很好玩。",
            )
        if grade in MID_GRADE:
            return (
                "uncle_fu",
                "用阳光好奇的语气，像一位风趣的科学老师在演示实验，"
                "把抽象的概念讲得生动有趣，吸引小朋友。",
            )
        return (
            "uncle_fu",
            "用清晰生动、略带幽默的语气，像高年级科学老师讲解原理，"
            "条理清楚，引发思考。",
        )

    # 兜底
    return ("vivian", "用温柔耐心的语气，像小学老师跟小朋友说话一样。")


# ---------------------------------------------------------------------------
# 文本规范化 + hash
# ---------------------------------------------------------------------------
def normalize(text: str) -> str:
    return math_speech(text)


def text_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def speech_metadata(text: str, subject: str, grade: int) -> dict:
    spoken = pinyin_speech(text) if subject == "chinese" and grade == 1 else None
    h = text_hash(pinyin_identity(text, spoken)) if spoken is not None else text_hash(text)
    return {"hash": h, "audio_rel": pinyin_audio_rel(text, spoken) if spoken is not None else f"{h[:2]}/{h}.opus",
            **({"spoken_text": spoken, "pronunciation_context": PINYIN_CONTEXT, "language": "Chinese"} if spoken is not None else {})}


def is_speakable(text: str) -> bool:
    text = text.strip()
    if not text:
        return False
    # 过滤过长或纯标点
    if len(text) > 400:
        return False
    if not (HAN_RE.search(text) or LATIN_RE.search(text) or re.search(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɑɡ]", text) or any(c.isdigit() for c in text)):
        return False
    return True


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def collect():
    if not OUTPUT_DIR.exists():
        sys.exit(f"❌ 找不到 output 目录: {OUTPUT_DIR}")

    seen: dict[str, dict] = {}
    stats = {"per_subject": {}, "per_field": {}}

    subjects = sorted(p.name for p in OUTPUT_DIR.iterdir() if p.is_dir())

    for subject in subjects:
        quiz_dir = OUTPUT_DIR / subject / "quizzes"
        if not quiz_dir.exists():
            continue

        files = sorted(quiz_dir.glob("*.json"))
        for fp in files:
            grade = parse_grade(fp.name) or 3  # 兜底
            try:
                data = json.loads(fp.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"⚠️  解析失败 {fp.name}: {e}", file=sys.stderr)
                continue

            def push(text: str, field: str):
                text = normalize(text or "")
                if not is_speakable(text):
                    return
                metadata = speech_metadata(text, subject, grade)
                spoken = metadata.get("spoken_text")
                h = metadata["hash"]
                if h in seen:
                    return
                lang = detect_language(text, subject, grade)
                speaker, instruction = pick_profile(subject, grade, lang)
                seen[h] = {
                    "hash": h,
                    "text": text,
                    "audio_rel": pinyin_audio_rel(text, spoken) if spoken is not None else f"{h[:2]}/{h}.opus",
                    **({"spoken_text": spoken, "pronunciation_context": PINYIN_CONTEXT} if spoken is not None else {}),
                    "language": lang,
                    "speaker": speaker,
                    "instruction": instruction,
                    "field": field,
                    "subject": subject,
                    "grade": grade,
                }
                stats["per_subject"][subject] = stats["per_subject"].get(subject, 0) + 1
                stats["per_field"][field] = stats["per_field"].get(field, 0) + 1

            # 题库题目
            for section in ("unit_test", "exam"):
                qs = (data.get(section) or {}).get("questions") or []
                for q in qs:
                    push(q.get("question", ""), "question")
                    for opt in q.get("options") or []:
                        # 去掉 "A. " "A、" 前缀，避免每个选项都被念成 "A 点"
                        clean = re.sub(r"^[A-Da-d][.、]\s*", "", opt)
                        push(clean, "option")
                    # 答案解析也读出来（用户翻看错题时可听）
                    push(q.get("explanation", ""), "explanation")

            # 知识点摘要
            for ks in data.get("knowledge_summary") or []:
                push(ks.get("point", ""), "kp_point")
                push(ks.get("core_concept", ""), "kp_core")
                push(ks.get("key_formula", ""), "kp_formula")
                push(ks.get("tips", ""), "kp_tips")
                for cm in ks.get("common_mistakes") or []:
                    push(cm, "kp_mistake")

    # ---------------------------------------------------------
    # 课文原文（语文/英语）—— data/passages/{subject}/{bookId}.json
    # 只收最终版（.json），不收草稿（.draft.json）
    # ---------------------------------------------------------
    passage_books = set()
    for passages_dir in (PASSAGES_DIR, BUNDLED_PASSAGES_DIR):
        for passages_file in sorted(passages_dir.rglob("*.json")):
            if passages_file.name.endswith(".draft.json"):
                continue
            try:
                pdoc = json.loads(passages_file.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"⚠️  解析 passages 失败 {passages_file.name}: {e}", file=sys.stderr)
                continue

            subject = pdoc.get("subject") or passages_file.parent.name
            book_id = pdoc.get("bookId")
            if book_id in passage_books:
                raise ValueError(f"Duplicate reading source: {book_id}")
            passage_books.add(book_id)
            grade = pdoc.get("grade") or parse_grade(passages_file.stem) or 3

            for passage in pdoc.get("passages") or []:
                pid = passage.get("id", "")
                plang = passage.get("language") or ("English" if subject == "english" else "Chinese")
                # speaker 由课文数据直接指定（extract_passages.py 填好的）；
                # 如缺失则走 pick_profile 兜底。
                forced_speaker = passage.get("speaker")
                sentences = passage.get("sentences") or []
                for si, sentence in enumerate(sentences):
                    text = normalize(sentence or "")
                    if not is_speakable(text):
                        continue
                    metadata = speech_metadata(text, subject, grade)
                    h = metadata["hash"]
                    if forced_speaker:
                        speaker = forced_speaker
                        _, instruction = pick_profile(subject, grade, plang)
                    else:
                        speaker, instruction = pick_profile(subject, grade, plang)

                    if h in seen:
                        # 该文本已被 quiz 阶段收过（比如 "Hi, I'm Wu Binbin." 也出现在英语选项里）。
                        # 课文句子在用户体验上**必须**被合成出来，而之前的 `field=option` 分类
                        # 会让 `api_tts.py --field passage_sentence` 过滤器漏掉它。
                        # 解决：覆盖该条 item 的 field 为 passage_sentence（优先级最高），
                        # 同时顺手挂上 passage 定位信息。语音内容不会变，只是分类变。
                        existing = seen[h]
                        if existing.get("field") != "passage_sentence":
                            stats["per_field"][existing["field"]] = (
                                stats["per_field"].get(existing["field"], 1) - 1
                            )
                            existing["field"] = "passage_sentence"
                            existing["speaker"] = speaker
                            existing["instruction"] = instruction
                            existing["language"] = metadata.get("language", plang)
                            existing["passage_id"] = pid
                            existing["sentence_index"] = si
                            stats["per_field"]["passage_sentence"] = (
                                stats["per_field"].get("passage_sentence", 0) + 1
                            )
                        continue

                    seen[h] = {
                        "hash": h,
                        "text": text,
                        **metadata,
                        "language": metadata.get("language", plang),
                        "speaker": speaker,
                        "instruction": instruction,
                        "field": "passage_sentence",
                        "subject": subject,
                        "grade": grade,
                        "passage_id": pid,
                        "sentence_index": si,
                    }
                    stats["per_subject"][subject] = stats["per_subject"].get(subject, 0) + 1
                    stats["per_field"]["passage_sentence"] = (
                        stats["per_field"].get("passage_sentence", 0) + 1
                    )

    # ---------------------------------------------------------
    # 故事阅读（语文/英语）—— data/stories/{subject}/{bookId}.json
    # 收集故事句子 + 题目/选项/解析
    # ---------------------------------------------------------
    if STORIES_DIR.exists():
        for stories_file in sorted(
            f for f in STORIES_DIR.rglob("*.json")
            if ".cache" not in f.parts
        ):
            try:
                sdoc = json.loads(stories_file.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"⚠️  解析 stories 失败 {stories_file.name}: {e}", file=sys.stderr)
                continue

            subject = sdoc.get("subject") or stories_file.parent.name
            grade = sdoc.get("grade") or parse_grade(stories_file.stem) or 3

            for story in sdoc.get("stories") or []:
                slang = "English" if story.get("language") == "English" else "Chinese"

                # 故事句子
                for sentence in story.get("sentences") or []:
                    text = normalize(sentence or "")
                    if not is_speakable(text):
                        continue
                    metadata = speech_metadata(text, subject, grade)
                    h = metadata["hash"]
                    if h in seen:
                        continue
                    speaker, instruction = pick_profile(subject, grade, slang)
                    seen[h] = {
                        "hash": h,
                        "text": text,
                        **metadata,
                        "language": metadata.get("language", slang),
                        "speaker": speaker,
                        "instruction": instruction,
                        "field": "story_sentence",
                        "subject": subject,
                        "grade": grade,
                    }
                    stats["per_subject"][subject] = stats["per_subject"].get(subject, 0) + 1
                    stats["per_field"]["story_sentence"] = (
                        stats["per_field"].get("story_sentence", 0) + 1
                    )

                # 故事题目/选项/解析
                for q in story.get("questions") or []:
                    push(q.get("question", ""), "story_question")
                    for opt in q.get("options") or []:
                        push(opt, "story_option")
                    push(q.get("explanation", ""), "story_explanation")

    items = list(seen.values())
    manifest = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "total_unique": len(items),
        "stats": stats,
        "items": items,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"✅ 写入 {MANIFEST_PATH}")
    print(f"   独立文本: {len(items)}")
    print("   分学科:")
    for k, v in sorted(stats["per_subject"].items()):
        print(f"     - {k:8s} {v}")
    print("   分字段:")
    for k, v in sorted(stats["per_field"].items()):
        print(f"     - {k:14s} {v}")


if __name__ == "__main__":
    collect()
