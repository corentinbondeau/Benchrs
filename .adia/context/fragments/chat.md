# Fragment — chat
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/app/(dashboard)/chat/ + src/lib/chat.ts

## Responsabilite
Messagerie d'equipe temps reel via Supabase Realtime. Canaux : general, parents, coachs, custom, joueur (prive coach-parent).

## Fichiers cles
| Fichier | Role |
|---------|------|
| (dashboard)/chat/page.tsx | Page messagerie |
| api/chat/player-channel/route.ts | POST — cree un canal prive joueur |
| lib/chat.ts | channelVisibleForRole, ensureChatMemberships, fetchChannelRecipients |
| lib/useChatUnread.ts | Hook pour badge non-lus |
| components/chat/ | Composants chat (messages, channels, input) |

## Points d'attention
- Les messages utilisent Supabase Realtime (subscribe)
- Les notifications de message passent par `/api/notifications/send` type "message"
- Les non-coachs ne peuvent notifier que sur les canaux dont ils sont membres
