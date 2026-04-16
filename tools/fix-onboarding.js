const fs = require('fs');
let c = fs.readFileSync('apps/jitpluspro/app/onboarding.tsx', 'utf8');

// 1. Replace handleCreateReward with handleRewardNext
const startMarker = 'Reward creation';
const endMarker = 'updateMerchant, goNext]);';
const lineWithStart = c.lastIndexOf('\n', c.indexOf(startMarker));
const endIdx = c.indexOf(endMarker);
if (lineWithStart === -1 || endIdx === -1) {
  console.log('PATTERN NOT FOUND:', lineWithStart, endIdx);
  process.exit(1);
}
const oldBlock = c.substring(lineWithStart, endIdx + endMarker.length);
console.log('Found old block, length:', oldBlock.length);

const newBlock = `
  // ── Reward step "Suivant" — auto-saves loyalty settings + reward ──────────
  const handleRewardNext = useCallback(async () => {
    // If the user filled in a reward name, validate and save everything
    const hasRewardData = rewardName.trim().length > 0;
    if (hasRewardData) {
      const costNum = parseInt(rewardCost, 10);
      if (!rewardCost || isNaN(costNum) || costNum < 1) {
        Alert.alert(t('common.error'), isStamps ? t('onboarding.rewardStampsRequired') : t('onboarding.rewardCostRequired'));
        return;
      }
      setCreatingReward(true);
      try {
        const limitVal = parseInt(accumulationLimit, 10);
        const rateVal = parseFloat(pointsRate);
        await api.patch('/merchant/loyalty-settings', {
          loyaltyType,
          stampEarningMode: isStamps ? stampEarningMode : undefined,
          pointsRate: !isNaN(rateVal) && rateVal > 0 ? rateVal : 10,
          accumulationLimit: hasAccumulationLimit && !isNaN(limitVal) && limitVal >= 1 ? limitVal : null,
        });
        await api.post('/rewards', {
          titre: rewardName.trim(),
          cout: costNum,
          description: rewardDesc.trim() || undefined,
        });
        updateMerchant({
          loyaltyType,
          pointsRate: !isNaN(rateVal) && rateVal > 0 ? rateVal : 10,
          stampEarningMode: isStamps ? stampEarningMode : undefined,
        });
        setRewardCreated(true);
      } catch (err) {
        Alert.alert(t('common.error'), getErrorMessage(err, t('onboarding.rewardError')));
        return; // Don't advance on error
      } finally {
        setCreatingReward(false);
      }
    }
    goNext();
  }, [rewardName, rewardCost, rewardDesc, isStamps, loyaltyType, stampEarningMode, pointsRate, hasAccumulationLimit, accumulationLimit, t, updateMerchant, goNext]);`;

c = c.replace(oldBlock, newBlock);
console.log('1. Replaced handleCreateReward with handleRewardNext');

// 2. Remove rewardTimerRef declaration
if (c.includes('rewardTimerRef')) {
  // Remove the const line
  c = c.replace(/.*rewardTimerRef = useRef.*\r?\n/, '');
  console.log('2a. Removed rewardTimerRef declaration');
  
  // Remove timer cleanup block in useEffect
  const cleanupStart = c.indexOf('// Cleanup reward timer');
  if (cleanupStart !== -1) {
    const blockEnd = c.indexOf('};', cleanupStart);
    if (blockEnd !== -1) {
      // Find the return () => { ... }; block
      const returnStart = c.lastIndexOf('return', blockEnd);
      const lineStart = c.lastIndexOf('\n', returnStart);
      const lineEnd = c.indexOf('\n', blockEnd + 2);
      c = c.substring(0, lineStart) + c.substring(lineEnd);
      console.log('2b. Removed timer cleanup from useEffect');
    }
  }
  
  // Remove timer check in goNext
  c = c.replace(/.*rewardTimerRef.*\r?\n/g, '');
  console.log('2c. Removed remaining rewardTimerRef references');
}

// 3. Remove useRef from import if no longer used
if (!c.includes('useRef')) {
  c = c.replace('useState, useRef, useCallback', 'useState, useCallback');
  console.log('3. Removed useRef from imports');
}

// Verify
console.log('\nVerification:');
console.log('  handleCreateReward present:', c.includes('handleCreateReward'));
console.log('  handleRewardNext present:', c.includes('handleRewardNext'));
console.log('  rewardTimerRef present:', c.includes('rewardTimerRef'));
console.log('  useRef present:', c.includes('useRef'));

fs.writeFileSync('apps/jitpluspro/app/onboarding.tsx', c);
console.log('\nDONE');
