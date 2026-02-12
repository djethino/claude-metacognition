/**
 * Message constants, repetition, and interleaving utilities.
 *
 * Uses the Google Research technique of repeating messages
 * for improved LLM adherence.
 */

// Number of times to repeat messages
const REPETITION_COUNT = 2;

/**
 * Repeat a message REPETITION_COUNT times, separated by ---.
 */
export function repeatMessage(message: string): string {
  const parts = Array.from({ length: REPETITION_COUNT }, () => message);
  return parts.join('\n\n---\n\n');
}

/**
 * Build interleaved nudge + prompt pattern.
 *
 * With REPETITION_COUNT=2: nudge + prompt + nudge (prompt appears 1 time)
 * With REPETITION_COUNT=3: nudge + prompt + nudge + prompt + nudge (prompt appears 2 times)
 * With REPETITION_COUNT=1: nudge only (prompt appears 0 times)
 */
export function buildInterleaved(nudge: string, prompt: string): string {
  if (REPETITION_COUNT <= 1) return nudge;

  const parts: string[] = [];
  for (let i = 0; i < REPETITION_COUNT; i++) {
    parts.push(nudge);
    if (i < REPETITION_COUNT - 1) {
      parts.push(`PROMPT UTILISATEUR :\n${prompt}`);
    }
  }
  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Message constants
// ---------------------------------------------------------------------------

export const POST_COMPACTION_METACOG = `Pendant ton travail, tu DOIS régulièrement te demander :
- Comprends-tu encore le POURQUOI de ce que tu fais ?
- Es-tu en train de simplifier ou couper des coins ?
- Risques-tu de casser quelque chose qui existait avant ?

Si une réponse t'inquiète → ARRÊTE et fais un point avec l'utilisateur :
- Qu'est-ce qui a été complètement fait ?
- Que reste-t-il à faire ?
- Qu'est-ce que tu n'es pas sûr de comprendre ?

Rappel : Après compaction, tu as tendance à devenir hyper-focalisé sur "la tâche" en oubliant le contexte global. Résiste à cette tendance.`;

export const NEW_SESSION_MESSAGE = `🆕 NOUVELLE SESSION

Tu démarres une nouvelle session. Tu n'as pas d'historique avec cet utilisateur dans ce projet.

Si l'utilisateur fait référence à du travail précédent, tu DOIS te poser ces questions :
- De quoi parle-t-il exactement ? (ne suppose pas)
- Quel existant dois-tu vérifier ? (fichiers, documents, contexte projet)
- Qu'est-ce qui te manque pour comprendre ?`;

export const PRE_TASK_REFLECTION = `🧠 RÉFLEXION — AVANT ET APRÈS

**AVANT DE COMMENCER**, tu DOIS formuler explicitement :
1. Quels sont **TOUS les éléments** de la demande ? (aucun n'est optionnel)
2. Que **comprends-tu** de chaque élément ?
3. Qu'est-ce que tu **INTERPRÈTES** ? (termes ambigus, contexte supposé)
4. Que **NE SAIS-TU PAS** qui pourrait être nécessaire ?
5. Quel **existant** dois-tu consulter ? (documents, travail précédent, contexte projet)

→ Si le point 4 contient des éléments critiques : **demande clarification** avant de foncer.

**AVANT DE CONCLURE**, tu DOIS vérifier :
1. Qu'est-ce que tu n'as **PAS traité** dans le prompt ? (aucun élément n'est optionnel)
2. As-tu produit quelque chose d'**UTILISABLE** ou juste d'**esquissé** ?
3. Que **reste-t-il à faire** pour que ce soit complet ?
4. Y a-t-il des éléments **en attente** d'autre chose ? (dépendances, validations)
5. Quelles **hypothèses** as-tu faites qui mériteraient d'être signalées ?

→ Si tu as été sélectif ou si tu as fait des hypothèses : **dis-le explicitement**.

Rappel : Le "plausible" est ton piège. Un senior traiterait TOUT le prompt, demanderait plutôt que de supposer, et signalerait ce qui reste flou.`;
