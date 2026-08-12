;; scripts/inventory.cljs — appview カタログの構造検査 + 在庫表。
;;
;;   nbb scripts/inventory.cljs          要約だけ
;;   nbb scripts/inventory.cljs --list   1 行 1 code の在庫表も出す
;;
;; この repo は 202 個のディレクトリがほぼ同じ形をしているので、目視では
;; 「1 つだけ形が違う」が見えない。ここで固定するのは次の 4 つだけ:
;;
;;   1. appview/ の直下は component か legacy service のどちらかである
;;   2. どちらも kotodama.jsonld を持ち、読める
;;   3. manifest の :name はディレクトリ名と一致する
;;   4. component 側と legacy service 側は同じ COFOG code 集合を覆う
;;
;; 4 は「TS-native 移行先が legacy を 1 対 1 で写している」という、この repo が
;; 成り立つための前提そのもの。破れたら移行先か移行元のどちらかが欠けている。
;;
;; UN COFOG 標準との突き合わせは ../org-un-cofog が checkout されている時だけ
;; 行い、**失敗にはしない** — あちらは 96 class 中 10 class しか公開していない
;; 途中の mirror なので、差は「このカタログの誤り」ではなく「あちらの未公開」。

(ns inventory
  (:require ["node:fs" :as fs]
            ["node:path" :as path]))

(def root (.resolve path (.dirname path *file*) ".."))
(def appview (.join path root "appview"))
(def list? (some #{"--list"} (js->clj (.slice js/process.argv 2))))

(defn- dir? [p] (and (.existsSync fs p) (.isDirectory (.statSync fs p))))

(defn- entries []
  (->> (.readdirSync fs appview)
       (filter #(dir? (.join path appview %)))
       sort vec))

(defn- kind-of [d]
  (cond (.startsWith d "cofog-") :component
        (.startsWith d "etzhayyim-performer-") :legacy
        :else :unknown))

;; code は 4 桁 class が基本だが、実測で 2 例だけ外れる（division の "10" と
;; budget-management の "01-1"）。正規化せずそのまま鍵にする — 表記を勝手に
;; 揃えると legacy 側との対応が崩れる。
(defn- code-of [d]
  (let [m (or (re-find #"^cofog-(\d+(?:-\d+)?)-" d)
              (re-find #"-svc-cofog-(\d+(?:-\d+)?)-" d))]
    (second m)))

(defn- manifest [d]
  (let [p (.join path appview d "kotodama.jsonld")]
    (if-not (.existsSync fs p)
      {:error "kotodama.jsonld が無い"}
      (try {:json (js->clj (.parse js/JSON (.readFileSync fs p "utf8")))}
           (catch :default e {:error (str "kotodama.jsonld が読めない: " (.-message e))})))))

(defn- collect [d]
  (let [k (kind-of d)
        {:keys [json error]} (manifest d)]
    {:dir d :kind k :code (code-of d) :error error
     :name (get json "name") :id (get json "@id")
     ;; src/ を持つ component だけが実装。他は manifest だけの在庫項目。
     :implemented? (dir? (.join path appview d "src"))}))

(def rows (mapv collect (entries)))

(def violations
  (vec (concat
        (for [r rows :when (= :unknown (:kind r))]
          (str "appview/" (:dir r) " — component でも legacy service でもない"))
        (for [r rows :when (:error r)]
          (str "appview/" (:dir r) " — " (:error r)))
        (for [r rows :when (nil? (:code r))]
          (str "appview/" (:dir r) " — ディレクトリ名から COFOG code を読めない"))
        (for [r rows :when (and (nil? (:error r)) (not= (:name r) (:dir r)))]
          (str "appview/" (:dir r) " — manifest の name が " (pr-str (:name r)) " でディレクトリ名と違う")))))

(def comp-codes (into #{} (keep :code (filter #(= :component (:kind %)) rows))))
(def legacy-codes (into #{} (keep :code (filter #(= :legacy (:kind %)) rows))))

(def mirror-violations
  (vec (concat
        (for [c (sort (remove legacy-codes comp-codes))]
          (str "COFOG " c " — component はあるが legacy service が無い"))
        (for [c (sort (remove comp-codes legacy-codes))]
          (str "COFOG " c " — legacy service はあるが component が無い")))))

(def all-violations (into violations mirror-violations))

;; ---------------------------------------------------------------- 出力

(let [comps (filter #(= :component (:kind %)) rows)
      legs  (filter #(= :legacy (:kind %)) rows)
      impl  (filter :implemented? comps)
      dids  (into #{} (keep :id rows))]
  (println (str "appview/: " (count rows) " エントリ"
                " — component " (count comps)
                " / legacy service " (count legs)))
  (println (str "COFOG code: " (count comp-codes) " 種"
                " （どちらの面も同じ集合を覆う: " (empty? mirror-violations) "）"))
  (println (str "実装済み component（src/ を持つ）: " (count impl)
                (when (seq impl) (str " — " (clojure.string/join ", " (map :dir impl))))))
  (println (str "manifest の @id: " (count dids) " 種 — " (clojure.string/join ", " (sort dids))))

  ;; 同じ code に複数のディレクトリが割り当たっている箇所（実測: 0310 が 5 本）。
  ;; 違反ではない — 同じ class を国別の窓口ごとに分けている。
  (let [dup (->> comps (group-by :code) (filter #(< 1 (count (val %)))) (into (sorted-map)))]
    (when (seq dup)
      (println (str "同一 code に複数 component: "
                    (clojure.string/join "; "
                      (map (fn [[c v]] (str c " ×" (count v) " ("
                                            (clojure.string/join " " (map :dir v)) ")")) dup))))))

  ;; UN COFOG 標準との突き合わせ（あれば）。差は報告するが失敗にはしない。
  (let [classes (.join path root ".." "org-un-cofog" "data" "classes")]
    (if-not (dir? classes)
      (println "org-un-cofog: 未 checkout — 標準との突き合わせは省略")
      (let [published (into #{} (map #(clojure.string/replace % #"\.json$" "")
                                     (filter #(.endsWith % ".json") (.readdirSync fs classes))))
            missing-here (sort (remove comp-codes published))]
        (println (str "org-un-cofog: " (count published) " class 公開済み"
                      " / このカタログが覆っていないもの " (count missing-here)
                      (when (seq missing-here) (str " — " (clojure.string/join " " missing-here)))))
        (println (str "  （このカタログの " (count (remove published comp-codes))
                      " code は org-un-cofog 側が未公開。あちらは 96 class 中"
                      " " (count published) " class までしか出していない）")))))

  (when list?
    (println)
    (doseq [r (sort-by (juxt :code :dir) comps)]
      (println (str "  " (:code r) "\t" (if (:implemented? r) "implemented" "stub      ") "\t" (:dir r))))))

(if (seq all-violations)
  (do (println)
      (println (str "FAIL: " (count all-violations) " 件の構造違反"))
      (doseq [v all-violations] (println (str "  - " v)))
      (js/process.exit 1))
  (println "\nOK: 構造違反なし"))
