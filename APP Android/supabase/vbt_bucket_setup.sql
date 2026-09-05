-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('vbt_files', 'vbt_files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to the bucket
CREATE POLICY "Public Access" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'vbt_files');

-- Allow authenticated users to upload files
CREATE POLICY "Auth Upload" 
    ON storage.objects FOR INSERT 
    WITH CHECK (
        bucket_id = 'vbt_files' 
        AND auth.role() = 'authenticated'
    );

-- Allow authenticated users to update their files
CREATE POLICY "Auth Update" 
    ON storage.objects FOR UPDATE 
    USING (
        bucket_id = 'vbt_files' 
        AND auth.role() = 'authenticated'
    );
