#!/usr/bin/env python3

import os
from supabase import create_client
import dotenv

dotenv.load_dotenv()

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_KEY')

print(f"URL: {supabase_url}")
print(f"Key: {supabase_key[:20]}...")

if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
    
    # Try different ways to query
    try:
        print("\nAttempting query...")
        response = supabase.table('phones').select('phone_number,employee_name,encryption_key').neq('encryption_key', None).limit(1).execute()
        print(f"Success: {response}")
        print(f"Data: {response.data}")
    except Exception as e:
        print(f"Error: {e}")
        print(f"Error type: {type(e)}")
        
        # Try alternative
        try:
            print("\nTrying alternative method...")
            result = supabase.rpc('select_phones').execute()
            print(f"RPC result: {result}")
        except Exception as e2:
            print(f"RPC error: {e2}")
