import { supabase } from '@/lib/supabaseBackendClient';
import { ApiClient } from '@/lib/apiClient';
import { Database, Json } from '@/lib/database.types';

export const handler = async () => {
  const apiClient = new ApiClient();

  try {
    // Read data from Supabase table
    const { data, error } = await supabase.from('requests')
      .select('*')
      .eq('isProcessed', 'false')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('No unprocessed requests found');
      return;
    }

    const request = data[0];
    const { size, species, challengeRating, isLegendary, user } = request;

    // Generate character
    const characterResponse = await apiClient.generateCharacter({
      size,
      species,
      challengeRating,
      isLegendary
    });

    const characterJson: Json = await JSON.parse(JSON.stringify(characterResponse.character));

    const character: Database['public']['Tables']['characters']['Insert'] = {
      character_data: characterJson,
      image_filename: characterResponse.imageUrl,
      user_id: user
    }
    
    const { data: insertCharData, error: insertCharError } = await supabase
      .from('characters')
      .insert([character])

    if (insertCharError) {
      throw insertCharError;
    }

    console.log('Inserted data', insertCharData);

    // Write data to Supabase table
    const { data: updateReqData, error: updateReqError } = await supabase.from('requests').update([
      { isProcessed: true },
    ]).eq('uuid', request.uuid);

    if (updateReqError) {
      throw updateReqError;
    }

    console.log('Updated data', updateReqData);
    
  } catch (error) {
    console.error('Error:', error);
  }
};
