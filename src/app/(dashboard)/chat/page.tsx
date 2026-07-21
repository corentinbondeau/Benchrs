"use client";

import { useState } from "react";
import { ChannelList, ChatWindow } from "@/components/chat/ChatWindow";

export default function ChatPage() {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-lg border overflow-hidden">
      <ChannelList
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
      />
      {selectedChannelId ? (
        <ChatWindow channelId={selectedChannelId} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg">Sélectionnez un canal pour commencer</p>
            <p className="text-sm mt-1">💬</p>
          </div>
        </div>
      )}
    </div>
  );
}
