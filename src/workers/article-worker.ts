import bunline from "bunline";
import type { ArticleJobData } from "../lib/queue";
import { processArticleJob } from "./article-processor";

bunline.setupThreadWorker<ArticleJobData>(processArticleJob);
