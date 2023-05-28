import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { supabase } from '@/lib/supabaseBackendClient';

interface RequestBody {
  size: string;
  species: string;
  challengeRating: number;
  isLegendary: boolean;
  user: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const requestBody: RequestBody = JSON.parse(event.body || '');
    const { size, species, challengeRating, isLegendary, user } = requestBody;

    // Write data to Supabase table
    await supabase.from('requests').insert([
      { size, species, challengeRating, isLegendary, user },
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Data successfully inserted' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An error occurred' }),
    };
  }
};
