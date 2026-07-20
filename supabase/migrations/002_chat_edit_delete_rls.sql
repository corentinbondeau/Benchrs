-- Add RLS policies for chat message edit/delete
CREATE POLICY "Users can edit own messages"
  ON chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete own messages"
  ON chat_messages FOR DELETE
  USING (sender_id = auth.uid());

CREATE POLICY "Coaches can delete any message"
  ON chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );
