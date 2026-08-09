(ns verify
  (:require ["node:child_process" :as child]
            ["node:fs" :as fs]
            ["node:path" :as path]))

(def root (.resolve path (.dirname path *file*) ".."))
(def compiler-root (.resolve path root "../../../../kotoba-lang/compiler"))
(def compiler-bin (.join path compiler-root "bin/kotoba"))
(def core-source (.join path root "src/cofog/civil_defense.kotoba"))
(def resilience-source (.join path root "src/cofog/civil_resilience.kotoba"))
(def authority-source (.join path root "src/cofog/authority_verifier.kotoba"))
(def storage-source (.join path root "src/cofog/checkpoint_store.kotoba"))
(def core-policy (.join path root "policy.edn"))
(def authority-policy (.join path root "authority-policy.edn"))
(def storage-policy (.join path root "storage-policy.edn"))
(def target-dir (.join path root "target"))
(def target-js (.join path target-dir "cofog-0220.mjs"))
(def resilience-target-js (.join path target-dir "cofog-0220-resilience.mjs"))

(defn compiler-run! [args]
  (let [result (.spawnSync child compiler-bin (clj->js (into ["-M"] args))
                           #js {:cwd compiler-root :encoding "utf8" :maxBuffer 16777216})]
    (when (or (.-error result) (not (zero? (or (.-status result) 70))))
      (throw (js/Error.
              (str "command failed: " (pr-str args) "\n"
                   (or (.-stdout result) "") (or (.-stderr result) "")))))
    result))

(defn denied? [source]
  (let [result (.spawnSync child compiler-bin
                           (clj->js ["-M" "check" source "--policy" core-policy])
                           #js {:cwd compiler-root :encoding "utf8" :maxBuffer 16777216})]
    (and (not (.-error result)) (not (zero? (or (.-status result) 0))))))

(defn compile! [args]
  (let [result (.spawnSync child "clojure" (clj->js (into ["-M:run"] args))
                           #js {:cwd compiler-root :encoding "utf8" :maxBuffer 16777216})]
    (when (or (.-error result) (not (zero? (or (.-status result) 70))))
      (throw (js/Error.
              (str "compile failed: " (pr-str args) "\n"
                   (or (.-stdout result) "") (or (.-stderr result) "")))))
    result))

(.mkdirSync fs target-dir #js {:recursive true})
(compiler-run! ["check" core-source "--policy" core-policy])
(compiler-run! ["check" resilience-source "--policy" core-policy])
(compiler-run! ["check" authority-source "--policy" authority-policy])
(compiler-run! ["check" storage-source "--policy" storage-policy])

(when-not (and (denied? authority-source) (denied? storage-source))
  (throw (js/Error. "effectful modules must fail closed under the empty policy")))

(compile! ["compile" core-source "--target" "js" "--policy" core-policy
           "--output" target-js])
(compile! ["compile" resilience-source "--target" "js" "--policy" core-policy
           "--output" resilience-target-js])

(let [runner (str "import {instantiateKotoba as core} from " (pr-str target-js) ";"
                  "import {instantiateKotoba as resilience} from "
                  (pr-str resilience-target-js) ";"
                  "for(const instantiate of [core,resilience]){"
                  "const result=instantiate({}).main();"
                  "if(result!==42n)throw new Error(`unexpected ${result}`);}")
      result (.spawnSync child js/process.execPath
                         (clj->js ["--input-type=module" "-e" runner])
                         #js {:cwd root :encoding "utf8" :maxBuffer 16777216})]
  (when (or (.-error result) (not (zero? (or (.-status result) 70))))
    (throw (js/Error. (str "restricted ESM conformance failed\n"
                           (or (.-stdout result) "") (or (.-stderr result) ""))))))

(println "kotoba check: core + resilience + authority + storage passed")
(println "deny-by-default: authority + storage passed")
(println "restricted ESM conformance: core + resilience main=42")
