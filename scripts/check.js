#!/usr/bin/env node

/**
 * Скрипт для проверки конфигурации
 */

import { config } from '../src/config/config.js';
import fs from 'fs';

console.log('🔍 Проверка конфигурации...\n');

const checks = {
  '✅ API_ID': config.telegram.apiId && !isNaN(config.telegram.apiId),
  '✅ API_HASH': config.telegram.apiHash && config.telegram.apiHash !== 'your_api_hash',
  '✅ PHONE_NUMBER': config.telegram.phoneNumber && config.telegram.phoneNumber !== '+your_phone_number',
  '✅ GROUP_CHAT_ID': config.group.chatId && config.group.chatId !== 'your_group_id',
  '✅ SESSION_STRING (опционально)': config.telegram.sessionString && config.telegram.sessionString.length > 0,
};

let allGood = true;

Object.entries(checks).forEach(([key, value]) => {
  if (value) {
    console.log(`${key}`);
  } else {
    const icon = key.includes('опционально') ? '⚠️' : '❌';
    console.log(`${icon} ${key.replace('✅ ', '')}`);
    if (!key.includes('опционально')) {
      allGood = false;
    }
  }
});

console.log('\n📋 Дополнительная информация:\n');

if (config.telegram.apiId) {
  console.log(`API_ID: ${config.telegram.apiId}`);
}

if (config.telegram.phoneNumber) {
  const phone = config.telegram.phoneNumber;
  if (!phone.startsWith('+')) {
    console.log('⚠️  PHONE_NUMBER должен начинаться с + (международный формат)');
    allGood = false;
  } else {
    console.log(`Номер телефона: ${phone}`);
  }
}

if (config.group.chatId) {
  console.log(`ID группы: ${config.group.chatId}`);
}

if (config.telegram.sessionString) {
  console.log(`Сессия: сохранена (${config.telegram.sessionString.length} символов)`);
} else {
  console.log('Сессия: не сохранена (потребуется ввод кода при запуске)');
}

// Проверка наличия .env файла
if (!fs.existsSync('.env')) {
  console.log('\n❌ Файл .env не найден!');
  console.log('Создайте его командой: cp .env.example .env');
  allGood = false;
}

console.log('\n' + '='.repeat(50));

if (allGood) {
  console.log('\n✅ Конфигурация корректна! Можно запускать бота.\n');
  console.log('Запуск: npm start\n');
} else {
  console.log('\n❌ Конфигурация некорректна. Исправьте ошибки выше.\n');
  console.log('Инструкция: смотрите README.md\n');
  process.exit(1);
}

