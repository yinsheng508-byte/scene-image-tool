/**
 * 自定义下拉选择器组件
 * 替代原生select，提供现代化的UI样式
 */

const activeDropdowns = new Set();

// 点击外部关闭所有下拉框
document.addEventListener('click', (e) => {
  activeDropdowns.forEach(dropdown => {
    if (!dropdown.container.contains(e.target)) {
      dropdown.close();
    }
  });
});

// ESC键关闭下拉框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    activeDropdowns.forEach(dropdown => dropdown.close());
  }
});

/**
 * 将原生select转换为自定义下拉组件
 * @param {HTMLSelectElement} selectEl 原生select元素
 * @param {Object} options 配置项
 * @param {Function} options.onChange 值变化回调
 * @param {Function} options.renderOption 自定义渲染选项
 * @returns {Object} 下拉组件实例
 */
export function createCustomSelect(selectEl, options = {}) {
  if (!selectEl || selectEl.tagName !== 'SELECT') {
    console.warn('createCustomSelect: invalid select element');
    return null;
  }

  const { onChange, renderOption } = options;

  // 隐藏原生select
  selectEl.style.display = 'none';

  // 创建自定义下拉容器
  const container = document.createElement('div');
  container.className = 'custom-select';

  // 创建触发按钮
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';

  // 创建下拉面板
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown';

  container.appendChild(trigger);
  container.appendChild(dropdown);

  // 插入到原生select后面
  selectEl.parentNode.insertBefore(container, selectEl.nextSibling);

  let isOpen = false;
  let currentValue = selectEl.value;
  let optionsList = [];

  // 更新选项列表
  function updateOptions() {
    optionsList = Array.from(selectEl.options).map(opt => {
      const parent = opt.parentElement;
      const group = parent && parent.tagName === "OPTGROUP" ? (parent.label || "") : "";
      return {
        value: opt.value,
        label: opt.textContent,
        disabled: opt.disabled,
        group
      };
    });
    renderDropdown();
  }

  // 渲染下拉内容
  function renderDropdown() {
    dropdown.innerHTML = '';

    let lastGroup = "__UNGROUPED__";
    optionsList.forEach(opt => {
      const currentGroup = opt.group || "__UNGROUPED__";
      if (currentGroup !== lastGroup) {
        lastGroup = currentGroup;
        if (opt.group) {
          const header = document.createElement("div");
          header.className = "custom-select-group";
          header.textContent = opt.group;
          dropdown.appendChild(header);
        }
      }

      const item = document.createElement('div');
      item.className = 'custom-select-option';
      if (opt.value === currentValue) {
        item.classList.add('selected');
      }
      if (opt.disabled) {
        item.classList.add('disabled');
      }

      if (typeof renderOption === 'function') {
        item.innerHTML = renderOption(opt);
      } else {
        item.textContent = opt.label;
      }

      item.dataset.value = opt.value;

      if (!opt.disabled) {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setValue(opt.value);
          close();
        });
      }

      dropdown.appendChild(item);
    });
  }

  // 更新触发按钮显示
  function updateTrigger() {
    const selected = optionsList.find(opt => opt.value === currentValue);
    if (typeof renderOption === 'function' && selected) {
      trigger.innerHTML = renderOption(selected) + '<span class="custom-select-arrow"></span>';
    } else {
      trigger.innerHTML = `<span class="custom-select-text">${selected?.label || ''}</span><span class="custom-select-arrow"></span>`;
    }
  }

  // 打开下拉框
  function open() {
    if (isOpen || container.classList.contains('disabled')) return;
    isOpen = true;
    container.classList.add('open');
    activeDropdowns.add(instance);

    // 滚动到选中项
    requestAnimationFrame(() => {
      const selectedItem = dropdown.querySelector('.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // 关闭下拉框
  function close() {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('open');
    activeDropdowns.delete(instance);
  }

  // 切换下拉框
  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  // 设置值
  function setValue(value, silent = false) {
    if (value === currentValue) return;
    currentValue = value;
    selectEl.value = value;
    updateTrigger();
    renderDropdown();

    if (!silent) {
      // 触发原生change事件
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof onChange === 'function') {
        onChange(value);
      }
    }
  }

  // 获取值
  function getValue() {
    return currentValue;
  }

  // 设置禁用状态
  function setDisabled(disabled) {
    container.classList.toggle('disabled', disabled);
    trigger.disabled = disabled;
  }

  // 刷新选项（当原生select的options变化时调用）
  function refresh() {
    currentValue = selectEl.value;
    updateOptions();
    updateTrigger();
  }

  // 销毁组件
  function destroy() {
    close();
    container.remove();
    selectEl.style.display = '';
    activeDropdowns.delete(instance);
  }

  // 绑定事件
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  // 监听原生select的变化
  const observer = new MutationObserver(() => {
    refresh();
  });
  observer.observe(selectEl, { childList: true, subtree: true });

  // 初始化
  updateOptions();
  updateTrigger();
  setDisabled(selectEl.disabled);

  const instance = {
    container,
    trigger,
    dropdown,
    open,
    close,
    toggle,
    setValue,
    getValue,
    setDisabled,
    refresh,
    destroy
  };

  return instance;
}

/**
 * 批量初始化下拉组件
 * @param {string} selector CSS选择器
 * @param {Object} options 配置项
 * @returns {Map} 元素到实例的映射
 */
export function initCustomSelects(selector, options = {}) {
  const instances = new Map();
  document.querySelectorAll(selector).forEach(select => {
    const instance = createCustomSelect(select, options);
    if (instance) {
      instances.set(select, instance);
    }
  });
  return instances;
}
