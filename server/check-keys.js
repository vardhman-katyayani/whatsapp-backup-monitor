#!/usr/bin/env node

import dotenv from 'dotenv';
import { supabase } from './services/supabase.js';

dotenv.config();

async function checkKeys() {
  const { data, error } = await supabase
    .from('phones')
    .select('phone_number, employee_name, encryption_key')
    .not('encryption_key', 'is', null)
    .limit(5);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Available Keys in Supabase:');
  console.log('==========================\n');
  data?.forEach(phone => {
    console.log(`Phone: ${phone.employee_name} (${phone.phone_number})`);
    if (phone.encryption_key) {
      console.log(`  encryption_key: ${phone.encryption_key.substring(0, 32)}... (${phone.encryption_key.length} chars)`);
    } else {
      console.log(`  encryption_key: NULL`);
    }
    console.log('');
  });
}

checkKeys().catch(console.error);
