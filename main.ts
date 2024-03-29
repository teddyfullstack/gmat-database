import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom@v0.1.35-alpha/deno-dom-wasm.ts";
import { database, Question } from "./database.ts";
import {
  parseContentsFromDocument,
  parseQuestionFromRawContent,
} from "./parser.ts";
import { generateReport, throttle } from "./utils.ts";

export const CRAWLERS = {
  RC: `https://gmatclub.com/forum/search.php?selected_search_tags%5B%5D=162&selected_search_tags%5B%5D=228&selected_search_tags%5B%5D=229&t=0&search_tags=exact&submit=Search`,
  SC: `https://gmatclub.com/forum/search.php?selected_search_tags%5B%5D=172&selected_search_tags%5B%5D=231&selected_search_tags%5B%5D=232&t=0&search_tags=exact&submit=Search`,
  CR: `https://gmatclub.com/forum/search.php?selected_search_tags%5B%5D=168&selected_search_tags%5B%5D=226&selected_search_tags%5B%5D=227&t=0&search_tags=exact&submit=Search`,
  PS: `https://gmatclub.com/forum/search.php?selected_search_tags%5B%5D=187&selected_search_tags%5B%5D=216&selected_search_tags%5B%5D=217&t=0&search_tags=exact&submit=Search`,
  DS: `https://gmatclub.com/forum/search.php?selected_search_tags%5B%5D=180&selected_search_tags%5B%5D=222&selected_search_tags%5B%5D=223&t=0&search_tags=exact&submit=Search`,
};

function getIdFromUrl(url: string) {
  if (url.endsWith(".html")) {
    url = url.slice(0, -5);
  }
  const parts = url.split("-");
  return parts[parts.length - 1];
}

async function fetchAsDOM(url: string) {
  const res = await fetch(url, {
    headers: {
      Cookie:
        "timer.add_answer_without_start=1; __gads=ID=b739aae4d6b48673-2269dd2851d800dc:T=1668173889:RT=1668237859:S=ALNI_Mb8rPmrqYtwh0huRidypke96twdgw; cto_bundle=6SEQZV9JNEp3dXFlcFVTbmI5RkRiZlZaaUFzUWlWTExqJTJGWVIxeXVjMjNMNmFwTUc0QkhSUHpCbHBEQmZyVnpFWGNYMDhCYXlqVURpTGpXZXMxcThIVmlVbXBhT0hWUWNuRkpvd3J0M0xjeVlWWTdQJTJGS3pNMVhOUkRodnlXYkJrJTJGalJ3Sw; _ga=GA1.2.1131835118.1668173470; _gid=GA1.2.189743523.1668173470; PHPSESSID=qbvnqubotj2ipvvh9qppj55aol; acgroupswithpersist=nada; acopendivids=gc-spoiler; __gpi=UID=00000b7a00b2a9e5:T=1668173889:RT=1668233840:S=ALNI_MbL3pkzJ4tflrcudG-xs3Oev8pjQg; __utma=118473247.1131835118.1668173470.1668173565.1668173565.1; __utmz=118473247.1668173565.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none)",
    },
  });
  const text = await res.text();
  const document = new DOMParser().parseFromString(text, "text/html");
  return document!;
}

async function crawlQuestion(
  url: string,
  type: keyof typeof CRAWLERS
): Promise<Question> {
  console.warn(">>> Crawling question", url);
  const id = getIdFromUrl(url);
  const document = await fetchAsDOM(url);
  const contents = parseContentsFromDocument(document);
  const [rawQuestion, ...explanations] = contents.slice(0, -1);
  const question = parseQuestionFromRawContent(rawQuestion, type);
  return {
    id,
    src: url,
    explanations,
    ...question,
  };
}

async function crawl() {
  for (const key in CRAWLERS) {
    const questionType = key as keyof typeof CRAWLERS;
    const url = database[questionType].length
      ? `${CRAWLERS[questionType]}&start=${database[questionType].length}`
      : CRAWLERS[questionType];
    console.warn(">>> Crawling ", questionType, url);
    const document = await fetchAsDOM(url);
    const posts = Array.from(document.querySelectorAll(".topic-link")).map(
      (title) => {
        const el = title as Element;
        return {
          title: el.getAttribute("title"),
          href: el.getAttribute("href"),
        };
      }
    );
    for (const post of posts) {
      const questionUrl = post.href!;
      const id = getIdFromUrl(questionUrl);
      if (!database[questionType].includes(id)) {
        try {
          await throttle();
          const question = await crawlQuestion(questionUrl, questionType);
          database[questionType].push(id);
          await Deno.writeTextFile(
            `./output/${id}.json`,
            JSON.stringify(question)
          );
          await Deno.writeTextFile(
            "./output/index.json",
            JSON.stringify(database)
          );
        } catch (error) {
          console.warn(
            `>>> Error while parsing question #${id}, skipping...`,
            error
          );
        }
      } else {
        console.warn(`>>> Question #${id} already crawln, skipping...`);
      }
    }
  }
}

await crawl();
generateReport();
